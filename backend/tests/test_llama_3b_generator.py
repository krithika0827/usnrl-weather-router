# Local-LLM (Llama-3.2-3B) summary generation tests
#
# These exercise the prompt builder and the authorization guard only. No
# llama-server is needed: nothing here makes a network call, so the suite runs
# the same on a machine with no model installed.
#
# See docs/llama-3b-summary-report.md, Finding 3, for why the waypoint-index
# cases below matter — the guard used to reject the true attribution and accept
# the false one.

from app.agents.specialized.llama_3b_generator import (
    _MAX_TABLE_ROWS,
    _Authorized,
    _build_digest,
    _build_prompt,
    _build_table,
    _unauthorized_numbers,
)


def make_route(count, overrides=None):
    """A synthetic route of `count` waypoints with smoothly varying values.

    Per-waypoint overrides are keyed by 0-based index, e.g.
    make_route(50, {37: {"wind_speed_mph": 31.4}}).
    """
    overrides = overrides or {}
    route = []
    for i in range(count):
        point = {
            "lat": round(21.31 + 0.2 * i, 2),
            "lon": round(-157.86 + 0.8 * i, 2),
            "eta": f"2026-07-{18 + i // 24:02d}T{i % 24:02d}:00:00Z",
            "temperature_f": round(84.0 - 0.3 * i, 1),
            "wind_speed_mph": round(12.0 + (i % 7), 1),
            "wind_direction_deg": round((60.0 + 4 * i) % 360, 1),
            "precipitation_in": 0.0,
            "humidity_pct": round(68.0 + 0.3 * i, 1),
        }
        point.update(overrides.get(i, {}))
        route.append(point)
    return route


# --- the sample-row table -------------------------------------------------


def test_short_route_shows_every_waypoint():
    auth = _Authorized()
    table = _build_table(auth, make_route(5))
    assert "(5 of 5, for context only)" in table
    for n in range(1, 6):
        assert f"WP{n}:" in table


def test_long_route_is_downsampled_but_keeps_both_endpoints():
    route = make_route(50)
    auth = _Authorized()
    table = _build_table(auth, route)
    rows = [line for line in table.splitlines() if line.startswith("WP")]
    assert len(rows) <= _MAX_TABLE_ROWS
    assert rows[0].startswith("WP1:")
    assert rows[-1].startswith("WP50:")


# --- the authorization guard ----------------------------------------------


def test_figures_from_the_prompt_are_accepted():
    route = make_route(5)
    auth = _Authorized()
    _build_prompt(auth, route, "USNS Mercy", "Test Route")
    assert _unauthorized_numbers(auth, "Winds reached 16.0 mph.") == []


def test_invented_figure_is_rejected():
    route = make_route(5)
    auth = _Authorized()
    _build_prompt(auth, route, "USNS Mercy", "Test Route")
    assert _unauthorized_numbers(auth, "Winds reached 99.9 mph.") == ["99.9"]


def test_timestamp_digits_do_not_authorize_figures():
    """An ETA is authorized whole, never as loose digits.

    2026-07-18T00:00:00Z must not make 2026 a legal wind speed.
    """
    route = make_route(3)
    auth = _Authorized()
    _build_prompt(auth, route, None, None)
    assert _unauthorized_numbers(auth, "Winds reached 2026 mph.") == ["2026"]
    assert _unauthorized_numbers(auth, "Arriving 2026-07-18T00:00:00Z.") == []


# --- Finding 3: waypoint indices are not measurements ---------------------


def test_waypoint_index_does_not_authorize_a_figure():
    """WP32 must not make 32 a legal wind speed.

    This is the namespace separation: an index is authorized as a waypoint
    reference and never enters the figure pool. Before the fix, a 50-waypoint
    route made every integer from 1 to 50 a permitted measurement.
    """
    route = make_route(50)
    auth = _Authorized()
    _build_prompt(auth, route, None, None)
    assert 32 in auth.waypoints  # authorized as a waypoint reference...
    assert 32.0 not in auth.numbers  # ...but never as a figure
    assert _unauthorized_numbers(auth, "Winds reached 32 mph.") == ["32"]


def test_unsampled_peak_waypoint_cannot_be_named():
    """Documents a known limitation, so it is not mistaken for correct behaviour.

    Peak wind at WP38, which the uniform stride does not sample and which sits
    below the 35 mph hazard threshold, so no hazard window names it either. The
    prompt therefore never mentions WP38, and the guard rejects it — including
    when the model is right. Annotating the digest with "(max at WP38)" was
    tried and reverted; see the module comment above _hazards and the report.

    In practice this rarely fires: with no extreme locations in the prompt, the
    model has nothing to copy and little reason to name one.
    """
    route = make_route(50, {37: {"wind_speed_mph": 31.4}})
    auth = _Authorized()
    prompt = _build_prompt(auth, route, None, None)

    assert "31.4" in prompt  # the value is available...
    assert "WP38" not in prompt  # ...but never its location
    assert _unauthorized_numbers(auth, "Winds peaked at 31.4 mph at WP38.") == ["WP38"]


def test_guard_does_not_bind_a_figure_to_a_waypoint():
    """Documents the residual gap, so it is not mistaken for a guarantee.

    Verification is set membership per token: it asks whether 31.4 was given
    and whether WP32 was given, never whether 31.4 belongs to WP32. WP32 is a
    sampled row, so misattributing the peak to it passes the guard. Closing
    this would need per-waypoint value binding.
    """
    route = make_route(50, {37: {"wind_speed_mph": 31.4}})
    auth = _Authorized()
    _build_prompt(auth, route, None, None)
    assert _unauthorized_numbers(auth, "Winds peaked at 31.4 mph at WP32.") == []


def test_waypoint_beyond_the_route_is_rejected():
    route = make_route(20)
    auth = _Authorized()
    _build_prompt(auth, route, None, None)
    assert _unauthorized_numbers(auth, "Conditions ease by WP47.") == ["WP47"]


# --- reverted: extreme locations are not annotated ------------------------


def test_digest_does_not_annotate_extreme_locations():
    """Guards the 2026-07-22 revert against reintroduction.

    Naming where each extreme occurred displaced required sentences the number
    guard cannot see missing (a real hazard in one run, "no hazards are
    indicated" in another). If this assertion starts failing, re-read "Cost of
    the extremes annotations" in the report before deciding it is a bug.
    """
    auth = _Authorized()
    digest = _build_digest(auth, make_route(20), None, None)
    assert "max at" not in digest
    assert "min at" not in digest


# --- the digest carries the derived facts ---------------------------------


def test_digest_covers_every_waypoint_not_just_the_sampled_rows():
    """The peak is in the statistics even though its row is not shown."""
    route = make_route(50, {37: {"wind_speed_mph": 31.4}})
    auth = _Authorized()
    digest = _build_digest(auth, route, None, None)
    assert "31.4" in digest
    assert "- waypoints: 50" in digest


def test_hazard_window_reports_the_span_and_is_authorized():
    gale = {"wind_speed_mph": 44.0}
    route = make_route(20, {8: gale, 9: gale, 10: gale})
    auth = _Authorized()
    digest = _build_digest(auth, route, None, None)
    assert "high winds: WP9 through WP11 of 20" in digest
    assert _unauthorized_numbers(auth, "High winds from WP9 through WP11.") == []
