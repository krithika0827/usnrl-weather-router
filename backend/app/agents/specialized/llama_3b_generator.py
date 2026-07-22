# Experimental local-LLM summary generation
"""Generate the weather summary with a local llama.cpp model.

Wired into /forecast and /summary ahead of the deterministic generator, which
answers instead whenever no model server is reachable, the output fails
verification, or LLM_SUMMARY_ENABLED is set false. See
docs/llama-3b-summary-report.md for the objective, design (digest ->
generate -> verify -> fallback), hallucination analysis, and findings.

Model
-----
This module is the Llama-3.2-3B-Instruct variant, and is named for it so that
parallel work on a larger model (an 8B variant in its own llama_8b_summary.py)
stays a separate file rather than a merge conflict in this one. The 3B in the
name records which model this file was tuned and measured against — the prompt,
the strict-rules list, and the whole pre-compute-then-verify design exist
because a 3B model cannot be trusted to derive figures from a table.

Mechanically nothing here is 3B-specific: it talks to any OpenAI-compatible
endpoint, so the model is whatever llama-server has loaded, and pointing
LOCAL_LLM_URL at a larger one works unchanged (see the report for the RAM
tradeoffs). The model that actually produced each summary is read back from the
server response and recorded in a signature line appended to the output, so the
served text always names the real model regardless of this file's name. Letting
a caller pick the model — or the summary *method* (a bigger LLM, or the
deterministic generator) — per request is a planned extension, not yet
implemented.

Machine requirements
--------------------
The whole quantized model must fit in RAM alongside everything else running,
so the recommended machine RAM is well above the model file size:
- 3B Q4_K_M (used here): ~2 GB model  -> 8 GB machine.
- 7-8B:                  ~5 GB model  -> 16 GB machine.
- 13B:                   ~8 GB model  -> 24-32 GB machine.
Needs llama.cpp with a GPU/CPU backend (Metal on macOS).

Install and start the model server
----------------------------------
    brew install llama.cpp
    llama-server -hf bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M --port 8080

The backend calls llama-server over HTTP. Run natively, the host is `localhost`;
from inside the Docker container it is `host.docker.internal` (Docker on macOS
cannot reach the GPU, so the server runs on the host). Both :8080 URLs are
probed once and cached until a request fails; set LOCAL_LLM_URL to override.

Standalone smoke test (no backend needed):

    python -m app.agents.specialized.llama_3b_generator
"""

from __future__ import annotations

import asyncio
import math
import os
import re
from typing import Any

import httpx

# Settings live here rather than in app/core/config.py so this experimental
# branch touches no shared file. Both are read at call time, not import time,
# so a caller or test can flip either with monkeypatch.setenv.
_ENV_ENABLED = "LLM_SUMMARY_ENABLED"
_ENV_BASE_URL = "LOCAL_LLM_URL"

_DISABLED_VALUES = {"0", "false", "no", "off"}

# Candidate base URLs, in probe order. LOCAL_LLM_URL wins if set.
_CANDIDATE_URLS = (
    "http://localhost:8080",
    "http://host.docker.internal:8080",
)


def _enabled() -> bool:
    """Whether the LLM path may run at all.

    On unless LLM_SUMMARY_ENABLED explicitly says otherwise: with no
    llama-server reachable this costs one 2 s probe and falls back, so the
    branch demonstrates itself out of the box. Setting it false forces the
    deterministic generator even when a model server is up — which is what
    the tests asserting the generator's exact wording need.

    This is a real switch rather than the PYTEST_CURRENT_TEST check it
    replaces: production code should not recognise its own test harness, and
    sniffing for one made the LLM path impossible to exercise deliberately.
    """
    return os.environ.get(_ENV_ENABLED, "true").strip().lower() not in _DISABLED_VALUES

# llama-server generation settings. Temperature 0 (greedy, deterministic)
# makes small models least likely to invent numbers; if that attempt fails the
# post-generation number check, warmer retries give different phrasings a
# chance before falling back to the deterministic generator.
_ATTEMPT_TEMPERATURES = (0.0, 0.4, 0.7)
_MAX_TOKENS = 300
_GENERATION_TIMEOUT_S = 120.0
_PROBE_TIMEOUT_S = 2.0

# Hazard thresholds. These deliberately mirror the values the deterministic
# generator uses, but this module keeps its own copy so the experimental LLM
# path stays self-contained and never reaches into the agents package. If the
# generator's thresholds are ever changed, change these to match — otherwise
# the digest and the fallback narrative will label the same route differently.
_HIGH_WIND_MPH = 35
_WET_PRECIP_IN = 0.25
_FREEZING_F = 32
_HEAT_F = 95

# Above this many waypoints the raw table is downsampled in the prompt so the
# token count stays bounded; the statistics digest still covers all of them.
_MAX_TABLE_ROWS = 12

# The prompt below carries every number the model is allowed to state. The
# instruction is deliberately strict: small models hallucinate when asked to
# derive figures from a long table, so we pre-compute them and forbid new ones.
_SYSTEM_PROMPT = (
    "You are a marine weather forecaster writing an operational route forecast "
    "discussion. You are given a ROUTE STATISTICS block with pre-computed "
    "figures, and a sample of waypoint rows for context. Write a "
    "single paragraph of 3 to 5 sentences in plain professional prose covering, "
    "in order: the route span (endpoints and waypoint count), temperatures, "
    "winds (speed and prevailing direction), precipitation, humidity, and the "
    "listed hazards.\n\n"
    "STRICT RULES:\n"
    "- Use ONLY numbers that appear verbatim in the ROUTE STATISTICS block or "
    "in the sample waypoint rows. Never compute, round, average, or invent any "
    "figure not shown in one of those two blocks.\n"
    "- Prefer the ROUTE STATISTICS figures when describing the route overall. "
    "Cite a sample row only to illustrate conditions at that waypoint, and name "
    "the waypoint when you do.\n"
    "- Do not mention pressure systems, fronts, or any phenomenon whose data "
    "is not provided.\n"
    "- State a distance only if a 'total distance' figure is given; otherwise "
    "do not mention distance at all.\n"
    "- State trends only as given by the 'trend' fields; do not infer rising or "
    "falling values yourself.\n"
    "- State every range with both its low and high values exactly as given. "
    "Never claim a value applies at all waypoints unless the statistics show a "
    "single value rather than a range.\n"
    "- If the hazards field says 'none', state that no hazards are indicated. "
    "Do not speculate about hazards that are not listed.\n"
    "- If a 'hazard window' line is given, say where along the route the "
    "hazard occurs using exactly that waypoint span and times. When stating "
    "window times, keep the full date attached to both the start and the end "
    "time; never merge two different dates into one.\n"
    "- Reproduce every date and time exactly as written, character for "
    "character. Never reformat, abbreviate, or split one.\n"
    "- Never discuss data availability, data gaps, or data quality.\n"
    "- If a metric is marked unavailable, say so rather than guessing.\n"
    "- Finish the paragraph within 5 sentences; a cut-off answer is discarded.\n"
    "- Output plain prose only: no markdown, headings, bullets, or lists."
)

_resolved_base_url: str | None = None


class _Authorized:
    """The figures and literal strings the model is permitted to reproduce.

    Collected as the prompt is built rather than scanned back off the finished
    text. Scanning is what made the old guard weak: it folded the digits of
    every ISO timestamp and coordinate into one flat pool of allowed figures,
    so an ETA of "2026-07-18T00:00:00Z" quietly authorised 2026, 18 and 0 as
    wind speeds. Here a timestamp is authorised only as a whole string, and
    the number pool holds nothing but real forecast figures.

    Waypoint references are kept in their own set for the same reason. Pooled
    with the figures they were strictly worse than useless: on a 50-waypoint
    route every integer from 1 to 50 became a legal wind speed, and because
    only sampled waypoints were authorised the guard rejected "31.4 mph at
    WP38" (true, WP38 unsampled) while passing "31.4 mph at WP32" (false,
    WP32 sampled) — anti-correlated with the truth it was meant to protect.
    """

    def __init__(self) -> None:
        self.numbers: set[float] = set()
        self.literals: set[str] = set()
        self.waypoints: set[int] = set()

    def figure(self, value: float, decimals: int = 1) -> str:
        """Authorize a number and return the rendering used in the prompt.

        The rendered form is what gets authorized, not the raw float: the
        prompt shows 84.03 as "84.0", and "84.0" is what the model will echo.
        Stored unsigned, because the scanner's regex cannot capture a leading
        minus — a longitude of -157.86 has to authorize the "157.86" that the
        scan will actually find.
        """
        text = f"{float(value):.{decimals}f}"
        self.numbers.add(abs(float(text)))
        return text

    def count(self, value: int) -> str:
        """Authorize an exact integer the model may state as a figure.

        Waypoint *counts* only ("20 waypoints", "3 of 20"). A waypoint
        *reference* goes through waypoint() instead, so an index never
        doubles as a permitted measurement.
        """
        self.numbers.add(float(value))
        return str(value)

    def waypoint(self, index: int) -> str:
        """Authorize a 1-based waypoint reference and return it as "WPn".

        Held apart from the number pool: the scanner masks WP tokens whole, so
        an authorized index never lends its digits to a hallucinated figure and
        an unauthorized one is reported as the waypoint it is.
        """
        self.waypoints.add(int(index))
        return f"WP{int(index)}"

    def literal(self, text: str) -> str:
        """Authorize a string that may only be reproduced verbatim."""
        if text:
            self.literals.add(str(text))
        return text

    def eta(self, value: Any) -> str | None:
        """Authorize a timestamp as whole strings, never as loose digits."""
        if value is None:
            return None
        text = self.literal(str(value))
        # Also authorize the date and time halves on their own, so a model
        # that splits "2026-07-18T00:00:00Z" across a sentence still verifies.
        # Only substantial parts: masking is textual, and a one- or two-digit
        # literal would blank out matching digits everywhere else in the text.
        for part in re.split(r"[T ]", text):
            if len(part) >= 4:
                self.literal(part)
        return text


def _point_to_dict(point: Any) -> dict:
    """Normalize a waypoint (Pydantic model or dict) to a plain dict; {} if neither."""
    if hasattr(point, "model_dump"):
        return point.model_dump()
    if isinstance(point, dict):
        return point
    return {}


def _is_number(value: Any) -> bool:
    """True only for real numeric values — bools are excluded despite being ints."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _values(points: list[dict], field: str) -> list[float]:
    """Collect the numeric values of one field across all waypoints, as floats."""
    return [float(p[field]) for p in points if _is_number(p.get(field))]


def _prevailing_direction(directions: list[float]) -> str | None:
    """Vector-averages compass bearings so 350 and 10 average to north, not south."""
    valid = [d % 360 for d in directions if 0 <= d <= 360]
    if not valid:
        return None
    sin_total = sum(math.sin(math.radians(d)) for d in valid)
    cos_total = sum(math.cos(math.radians(d)) for d in valid)
    if abs(sin_total) < 0.001 and abs(cos_total) < 0.001:
        return None
    average = math.degrees(math.atan2(sin_total, cos_total)) % 360
    labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
              "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return labels[int((average + 11.25) // 22.5) % len(labels)]


def _fmt(auth: _Authorized, value: Any, unit: str = "", decimals: int = 1) -> str:
    """Format a value with an optional unit, or "N/A" for missing/boolean values."""
    if isinstance(value, bool) or value is None:
        return "N/A"
    if isinstance(value, (int, float)):
        return f"{auth.figure(value, decimals)}{unit}"
    return str(value)


def _trend(values: list[float]) -> str:
    """Compares first and last available reading; small models can't be trusted
    to read a trend off a long table, so we state it explicitly."""
    if len(values) < 2:
        return "steady"
    delta = values[-1] - values[0]
    if abs(delta) < 1:
        return "steady"
    return "rising" if delta > 0 else "falling"


def _range_str(
    auth: _Authorized, values: list[float], unit: str, decimals: int = 1
) -> str:
    """Render "low to high unit" (or a single value when the range is flat)."""
    if not values:
        return "unavailable"
    low, high = min(values), max(values)
    if abs(high - low) < 0.05:
        return f"{auth.figure(low, decimals)} {unit}".strip()
    low_text = auth.figure(low, decimals)
    high_text = auth.figure(high, decimals)
    return f"{low_text} to {high_text} {unit}".strip()


# Deliberately absent: an "(max at WPn)" annotation on each statistics line.
# Tried 2026-07-22 and reverted the same day. It named every extreme correctly,
# but the extra content displaced required sentences the number guard cannot
# see missing — one run dropped a real wet-conditions hazard, another dropped
# "no hazards are indicated" — and it is redundant where it matters: a peak
# that crosses a threshold is already pinned by its hazard window, and one that
# does not is by definition not worth the sentence. See the report, "Cost of
# the extremes annotations".


def _hazards(auth: _Authorized, temps, winds, precip) -> list[str]:
    """List the hazards whose thresholds the route's extreme values cross."""
    found = []
    if winds and max(winds) >= _HIGH_WIND_MPH:
        found.append(f"high winds (max {auth.figure(max(winds))} mph)")
    if precip and max(precip) >= _WET_PRECIP_IN:
        found.append(f"wet conditions (max {auth.figure(max(precip), 2)} in)")
    if temps and min(temps) <= _FREEZING_F:
        found.append(f"freezing temperatures (min {auth.figure(min(temps))} F)")
    if temps and max(temps) >= _HEAT_F:
        found.append(f"heat (max {auth.figure(max(temps))} F)")
    return found


def _hazard_windows(auth: _Authorized, points: list[dict]) -> list[str]:
    """Tells the model WHERE each hazard occurs — a range summary alone hides
    whether the dangerous stretch is one waypoint or the whole route."""
    checks = (
        ("high winds", "wind_speed_mph", lambda v: v >= _HIGH_WIND_MPH),
        ("wet conditions", "precipitation_in", lambda v: v >= _WET_PRECIP_IN),
        ("freezing temperatures", "temperature_f", lambda v: v <= _FREEZING_F),
        ("heat", "temperature_f", lambda v: v >= _HEAT_F),
    )
    windows = []
    for label, field, hit in checks:
        indices = [
            i for i, p in enumerate(points)
            if _is_number(p.get(field)) and hit(float(p[field]))
        ]
        if not indices:
            continue
        first, last = indices[0], indices[-1]
        if first == 0 and last == len(points) - 1:
            windows.append(f"{label}: entire route")
            continue
        if first == last:
            span = auth.waypoint(first + 1)
            eta = auth.eta(points[first].get("eta"))
            etas = f" (around {eta})" if eta else ""
        else:
            span = f"{auth.waypoint(first + 1)} through {auth.waypoint(last + 1)}"
            start_eta = auth.eta(points[first].get("eta"))
            end_eta = auth.eta(points[last].get("eta"))
            etas = (
                f" ({start_eta} to {end_eta})"
                if start_eta and end_eta
                else ""
            )
        windows.append(f"{label}: {span} of {auth.count(len(points))}{etas}")
    return windows


def _data_gaps(auth: _Authorized, points: list[dict]) -> list[str]:
    """Missing metrics must be surfaced, not silently dropped from the stats.

    The counts are authorized even though they never enter the prompt: the note
    is appended to the served summary, so a critic re-verifying that text would
    otherwise flag these Python-computed truths as hallucinations.
    """
    labels = {
        "temperature_f": "temperature",
        "wind_speed_mph": "wind",
        "precipitation_in": "precipitation",
        "humidity_pct": "humidity",
    }
    gaps = []
    for field, label in labels.items():
        missing = sum(1 for p in points if p.get(field) is None)
        if missing:
            gaps.append(
                f"{label} missing at {auth.count(missing)} of "
                f"{auth.count(len(points))} waypoints"
            )
    return gaps


def _total_distance_nm(points: list[dict]) -> float | None:
    """Great-circle (haversine) sum over consecutive waypoints, in nautical
    miles. Returns None if any leg lacks coordinates, so the model is never
    handed a partial figure to state."""
    total = 0.0
    for prev, cur in zip(points, points[1:]):
        lats = (prev.get("lat"), cur.get("lat"))
        lons = (prev.get("lon"), cur.get("lon"))
        if not all(_is_number(v) for v in lats + lons):
            return None
        lat1, lat2 = math.radians(lats[0]), math.radians(lats[1])
        dlat = lat2 - lat1
        dlon = math.radians(lons[1] - lons[0])
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        total += 2 * math.asin(math.sqrt(a)) * 3440.065  # Earth radius in nm
    return total


def _endpoint_str(auth: _Authorized, point: dict) -> str:
    """Format one endpoint as "lat, lon at eta" for the digest's start/end lines."""
    lat, lon = point.get("lat"), point.get("lon")
    coords = (
        f"{auth.figure(lat, 2)}, {auth.figure(lon, 2)}"
        if _is_number(lat) and _is_number(lon)
        else "unknown coordinates"
    )
    return f"{coords} at {auth.eta(point.get('eta')) or 'unknown time'}"


def _build_digest(
    auth: _Authorized,
    points: list[dict],
    vehicle_name: str | None,
    route_name: str | None,
) -> str:
    """Pre-compute every figure the model is permitted to state."""
    temps = _values(points, "temperature_f")
    winds = _values(points, "wind_speed_mph")
    directions = _values(points, "wind_direction_deg")
    humidity = _values(points, "humidity_pct")
    precip = _values(points, "precipitation_in")

    direction = _prevailing_direction(directions)
    hazards = _hazards(auth, temps, winds, precip)

    lines = ["ROUTE STATISTICS (use only these numbers):"]
    if vehicle_name:
        lines.append(f"- vehicle: {vehicle_name}")
    if route_name:
        lines.append(f"- route name: {route_name}")
    lines.append(f"- waypoints: {auth.count(len(points))}")
    lines.append(f"- start: {_endpoint_str(auth, points[0])}")
    lines.append(f"- end: {_endpoint_str(auth, points[-1])}")
    distance = _total_distance_nm(points)
    if distance is not None:
        lines.append(f"- total distance: {auth.figure(distance, 0)} nm")
    lines.append(
        f"- temperature: {_range_str(auth, temps, 'F')}; trend {_trend(temps)}"
    )
    lines.append(
        f"- wind speed: {_range_str(auth, winds, 'mph')}; "
        f"prevailing direction {direction or 'unavailable'}; "
        f"trend {_trend(winds)}"
    )
    if precip:
        lines.append(
            f"- precipitation: per-waypoint {_range_str(auth, precip, 'in', 2)}; "
            f"total {auth.figure(sum(precip), 2)} in"
        )
    else:
        lines.append("- precipitation: unavailable")
    lines.append(f"- humidity: {_range_str(auth, humidity, '%', 0)}")
    lines.append(f"- hazards: {'; '.join(hazards) if hazards else 'none'}")
    for window in _hazard_windows(auth, points):
        lines.append(f"- hazard window: {window}")
    return "\n".join(lines)


def _build_table(auth: _Authorized, points: list[dict]) -> str:
    """A raw-row sample for context. Downsampled for long routes.

    Every value rendered here is authorized. These are real readings for real
    waypoints, so a model quoting one is reporting, not hallucinating; leaving
    them unauthorized meant the guard rejected faithful summaries — most
    reliably the wind directions, which the digest carries only as a compass
    word and never in degrees.
    """
    count = len(points)
    if count <= _MAX_TABLE_ROWS:
        indices = list(range(count))
    else:
        # Even stride across the route, always keeping first and last.
        step = (count - 1) / (_MAX_TABLE_ROWS - 1)
        indices = sorted({round(i * step) for i in range(_MAX_TABLE_ROWS)})

    lines = [f"SAMPLE WAYPOINT ROWS ({len(indices)} of {count}, for context only):"]
    for i in indices:
        p = points[i]
        lines.append(
            f"{auth.waypoint(i + 1)}: temp {_fmt(auth, p.get('temperature_f'), ' F')}, "
            f"wind {_fmt(auth, p.get('wind_speed_mph'), ' mph')} "
            f"from {_fmt(auth, p.get('wind_direction_deg'), ' deg')}, "
            f"precip {_fmt(auth, p.get('precipitation_in'), ' in', 2)}, "
            f"humidity {_fmt(auth, p.get('humidity_pct'), '%', 0)}"
        )
    return "\n".join(lines)


def _build_prompt(
    auth: _Authorized,
    points: list[dict],
    vehicle_name: str | None,
    route_name: str | None,
) -> str:
    """Assemble the full user prompt: digest + sample table + closing instruction."""
    return (
        _build_digest(auth, points, vehicle_name, route_name)
        + "\n\n"
        + _build_table(auth, points)
        + "\n\nWrite the forecast discussion now, following the strict rules."
    )


async def _resolve_base_url(client: httpx.AsyncClient) -> str | None:
    """Find a reachable llama-server, preferring the configured override.

    Cached, but the cache is dropped by _forget_base_url as soon as a request
    against it fails, so a server that restarts on the other host is picked up
    on the next call instead of leaving the feature off until a redeploy.
    """
    global _resolved_base_url
    if _resolved_base_url is not None:
        return _resolved_base_url

    override = os.environ.get(_ENV_BASE_URL)
    candidates = (override,) if override else _CANDIDATE_URLS

    for base in candidates:
        try:
            response = await client.get(f"{base}/health", timeout=_PROBE_TIMEOUT_S)
            if response.status_code == 200:
                _resolved_base_url = base
                return base
        except httpx.HTTPError:
            continue
    return None


def _forget_base_url() -> None:
    """Drop the cached endpoint so the next request re-probes the candidates."""
    global _resolved_base_url
    _resolved_base_url = None


_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
_WAYPOINT_RE = re.compile(r"\bWP\s?(\d+)\b", re.IGNORECASE)


def _unauthorized_numbers(auth: _Authorized, text: str) -> list[str]:
    """Figures and waypoint references in the model's text that it was never given.

    Any figure absent from the authorized set is invented (observed: a garbled
    hazard window "WP20 through WP30" for a true WP23-WP31). Timestamps and
    coordinate pairs are masked out whole before the scan, so their digits are
    accepted in place and nowhere else; values are compared as floats so "70"
    matches "70.0" and "0.10" matches "0.1".

    Waypoint references are resolved first and always masked, authorized or
    not, so "WP38" can never satisfy the scan as the figure 38.
    """
    unauthorized: list[str] = []

    def resolve(match: re.Match) -> str:
        if int(match.group(1)) not in auth.waypoints:
            unauthorized.append(match.group(0))
        return " "

    text = _WAYPOINT_RE.sub(resolve, text)
    # Longest first, so masking "2026-07-18T00:00:00Z" wins over its own date.
    for literal in sorted(auth.literals, key=len, reverse=True):
        text = text.replace(literal, " ")
    unauthorized.extend(
        s for s in _NUMBER_RE.findall(text) if float(s) not in auth.numbers
    )
    return unauthorized


async def _generate_once(
    client: httpx.AsyncClient, base: str, prompt: str, temperature: float
) -> tuple[str | None, str | None]:
    """Run one generation. Returns (text, model_id), or (None, None) if the
    server truncated the answer at the token cap.

    Truncation has to be caught here: every number in a half-written paragraph
    can still be legitimate, so the number guard would happily pass a forecast
    that stops mid-sentence.
    """
    response = await client.post(
        f"{base}/v1/chat/completions",
        json={
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": _MAX_TOKENS,
        },
    )
    response.raise_for_status()
    payload = response.json()
    choice = payload["choices"][0]
    if choice.get("finish_reason") == "length":
        return None, None
    text = " ".join(choice["message"]["content"].split()).strip()
    # Model that actually produced this text, as reported by the server — so
    # the signature tracks whatever is loaded.
    return text, payload.get("model") or "local model"


async def generate_weather_summary_llama_3b(
    route: list[Any],
    vehicle_name: str | None = None,
    route_name: str | None = None,
) -> str | None:
    """Generate a summary via local llama-server; None means fall back.

    Every attempt is verified: a summary is only returned if all numbers it
    states were given to the model. Failed attempts retry at progressively
    warmer temperatures; if none passes, None is returned and the caller falls
    back to the deterministic generator.
    """
    if not route or not _enabled():
        return None

    points = [p for p in (_point_to_dict(r) for r in route) if p]
    if not points:
        return None

    # Built once: the prompt is identical at every temperature, and rebuilding
    # it re-ran the haversine sum and every range scan on each retry.
    auth = _Authorized()
    prompt = _build_prompt(auth, points, vehicle_name, route_name)
    gaps = _data_gaps(auth, points)

    summary: str | None = None
    model_id: str | None = None
    async with httpx.AsyncClient(timeout=_GENERATION_TIMEOUT_S) as client:
        base = await _resolve_base_url(client)
        if base is None:
            return None

        for temperature in _ATTEMPT_TEMPERATURES:
            try:
                candidate, candidate_model = await _generate_once(
                    client, base, prompt, temperature
                )
            except (httpx.HTTPError, KeyError, IndexError, ValueError):
                # One bad attempt must not cancel the ladder — a 503 here is
                # usually the server still loading the model. Drop the cached
                # endpoint in case it has moved, then try the next temperature.
                _forget_base_url()
                continue
            if candidate and not _unauthorized_numbers(auth, candidate):
                summary = candidate
                model_id = candidate_model
                break

    if summary is None:
        return None

    # Data-gap reporting is appended deterministically: small models handle
    # "mention gaps only if present" conditionals unreliably (they either skip
    # the note or discuss gaps that don't exist), and Python never does.
    if gaps:
        summary += (
            " Note: " + "; ".join(gaps) + "; the narrative should be reviewed "
            "against the table before release."
        )
        # Re-checked so the invariant holds for the whole served text, not just
        # the model's part of it.
        if _unauthorized_numbers(auth, summary):
            return None

    # Signature identifying the model that generated the summary. Appended
    # after verification so its version digits never trip the number guard,
    # and so callers/readers can always tell AI-written text apart.
    return f"{summary}\n\n— AI-generated summary (model: {model_id})"


if __name__ == "__main__":
    # Standalone smoke test against a running llama-server.
    _sample_route = [
        {
            "lat": 21.31, "lon": -157.86, "eta": "2026-07-18T00:00:00Z",
            "temperature_f": 84.0, "wind_speed_mph": 14.0,
            "wind_direction_deg": 60.0, "precipitation_in": 0.0,
            "humidity_pct": 68.0,
        },
        {
            "lat": 25.5, "lon": -145.0, "eta": "2026-07-19T12:00:00Z",
            "temperature_f": 79.0, "wind_speed_mph": 22.0,
            "wind_direction_deg": 45.0, "precipitation_in": 0.1,
            "humidity_pct": 74.0,
        },
        {
            "lat": 32.71, "lon": -117.16, "eta": "2026-07-21T06:00:00Z",
            "temperature_f": 71.0, "wind_speed_mph": 9.0,
            "wind_direction_deg": 290.0, "precipitation_in": 0.0,
            "humidity_pct": 70.0,
        },
    ]

    result = asyncio.run(
        generate_weather_summary_llama_3b(
            _sample_route, vehicle_name="RV Test", route_name="HNL-SAN"
        )
    )
    if result is None:
        raise SystemExit(
            "No llama-server reachable (or generation failed). Start one with:\n"
            "  llama-server -hf bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M "
            "--port 8080"
        )
    print(result)
