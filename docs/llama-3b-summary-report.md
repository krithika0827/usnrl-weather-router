# Local-LLM Weather Summary (Llama-3.2-3B) — Research Report (condensed)

**Date:** 2026-07-17, revised 2026-07-22 · **Status:** proof of concept, not final implementation

**Scope note:** this report covers the **3B** variant (`llama_3b_generator.py`). Work on an 8B model is a separate module and a separate report; the architecture below is intended to be shared, the measurements are not.

## Objective

Determine whether the AI weather summary can run on a **local model** (no cloud API, no credits, no data leaving the machine) with accuracy good enough for an operational forecast product — and find the prompting approach that eliminates hallucinations.

## Test setup

| Component | Value |
|---|---|
| Hardware | Apple M3, 8 GB RAM (MacBook) |
| Runtime | llama.cpp (`brew install llama.cpp`), `llama-server`, Metal GPU |
| Model | Llama-3.2-3B-Instruct, Q4_K_M quantization (~1.9 GB GGUF) |
| Serving | Native on host at `localhost:8080` (Docker on macOS cannot reach the GPU); backend container connects via `host.docker.internal:8080` |
| Integration | `backend/app/agents/specialized/llama_3b_generator.py`, wired into `/forecast` and `/summary` ahead of the deterministic fallback. On by default; `LLM_SUMMARY_ENABLED=false` forces the deterministic path, `LOCAL_LLM_URL` overrides endpoint probing |
| Cost | None — fully offline after the one-time model download |

## Background in brief

**llama.cpp** runs LLMs on ordinary hardware. The model is one ~1.9 GB `.gguf` file (quantized to ~4.5 bits per weight), and `llama-server` serves it on `localhost` using the OpenAI chat API format — so `llama_3b_generator.py` works unchanged against a bigger machine or a hosted API later. Nothing leaves the machine; air-gapped deployment is one copied file.

**Why LLMs hallucinate:** a model only predicts a plausible next token. It has no calculator and no flag distinguishing "value I copied from the prompt" from "value that fits the sentence." Whenever the narrative needs a *derived* fact — a distance, a trend, a maximum — prediction fills the gap.

**Temperature 0** takes the single most-probable token every time: same prompt, byte-for-byte same output.

**Performance:** 3–10 s per summary (~13.5 s with a retry), ~2.5 GB resident, and **no route-length sensitivity** — the digest keeps prompts near-constant, so 50 waypoints costs the same as 3.

## Hardware caps the model

RAM is the binding constraint — the whole quantized model must fit alongside Docker, browser, etc.

| Model size | GGUF file | Comfortable minimum RAM | Notes |
|---|---|---|---|
| **3 B (used here)** | **~2 GB** | **8 GB** | works alongside Docker + browser on this MacBook |
| 7–8 B | ~4.5–5 GB | 16 GB | better prose and instruction-following; risky on 8 GB |
| 13 B | ~8 GB | 24–32 GB | diminishing returns for this task |

8 GB locks out the 7–8B tier that would meaningfully improve prose and reduce qualitative slips. **On a 16 GB+ machine, please trial Llama-3.1-8B or Qwen2.5-7B (Q4)** — the pipeline works unchanged, just point `llama-server` at a different file.

## Test matrix

Seven synthetic routes across climates, lengths, and edge cases, plus a follow-up batch of three more 50-waypoint routes (all passing). Each run verified automatically — **every number in the summary must appear in the digest** — plus manual review of trends, directions, hazards, and phrasing. (The driver script is not in this branch; results are from a local run.)

| Route | WPs | Climate / purpose | Expected hazards |
|---|---|---|---|
| tropical_3wp | 3 | Hawaii, benign | none |
| gulf_heat_5wp | 5 | Persian Gulf summer | heat (≥95 °F) |
| arctic_10wp | 10 | Norwegian Sea winter gale | freezing + high winds + wet |
| temperate_25wp | 25 | SAN→SFO coastal, gentle gradients | none |
| storm_50wp | 50 | HNL→SAN with storm band WP23–31 | high winds + wet, localized |
| missing_data_8wp | 8 | Nulls in temp/wind/precip (API-failure shape) | none, gaps must be disclosed |
| single_1wp | 1 | Degenerate route | none |

## Finding 1 — raw route data in, hallucinations out

The baseline prompt handed over the raw waypoint table with the instruction "Use only the values provided; never invent data." That did nothing. On a 3-waypoint HNL→SAN route (temps 84→79→71 °F, winds 14/22/9 mph, precip 0/0.1/0 in), one paragraph produced:

1. **"spanning approximately 11.45 nautical miles"** — no distance was in the prompt at all (true span ~2,270 nm). The genre expects a distance, so the model invented one.
2. **"temperatures rising to 79.0 F"** — 84→79 is a *fall*. Real value, wrong derived direction.
3. **"speeds potentially reaching 35 mph"** — data max is 22. The 35 leaked from the *instructions* (high winds defined as "≥ 35 mph") into the forecast as if it were data.
4. **"precipitation is not expected at any point"** — WP2 has 0.1 in.

Another run invented a "high-pressure system"; no pressure data exists in this system. **Lesson: a 3B model phrases well but derives badly.** Every failure was the model *computing* something instead of copying it, or supplying a genre-conventional fact the data didn't contain.

## Finding 2 — retrying the raw prompt can't fix it

A critic→regenerate loop is the obvious next idea. A controlled experiment (same route, four generations) shows why it can't work on the raw prompt:

- **At temperature 0 the output is byte-for-byte identical every run**, so hallucination is *deterministic* — the same invented 2,500 nm distance and the same self-contradiction ("no measurable precipitation for the entire route… however 0.1 inches at WP2"). A retry loop gets the identical bad summary forever.
- **At 0.7 retries vary, but variation is not correction.** One run said 1,600 nm (vs. 2,500 at temp 0 — two confident contradictory answers is itself proof of fabrication) and denied the real precipitation; another added brand-new errors (heading "westward" on an eastbound route, a 45° wind called "westerly").

A retry loop converges only if attempts can differ **and** the gate knows good from bad. The raw prompt fails one or the other at every temperature. The fix is to give the loop ground truth — the digest.

## The fix — digest → generate → verify → fallback

1. **Digest-first prompting.** Python pre-computes every figure the narrative needs — ranges, trends, vector-averaged prevailing wind, great-circle distance, hazards with waypoint/time windows — and the prompt forbids stating any number not in the digest. The model's only job is to rephrase. Result: 7/7 routes passed number verification on the first matrix run.
2. **Deterministic post-processing.** Conditional instructions ("mention gaps only if present") failed both ways, so the data-gap note is appended in Python after generation. Reliable by construction.
3. **Runtime verification with retry.** Every number in the output is checked at serve time against the figures the model was actually given, collected as the prompt is built — so it covers the digest and sample rows but never the component digits of a timestamp or coordinate, and waypoint references are held in their own set and masked whole (Finding 3). A response truncated at the token cap is rejected outright, since a paragraph cut mid-sentence can still contain only legitimate numbers. Temp-0 first, warmer retries (0.4, 0.7) on failure, deterministic fallback if all fail. Across ~35 calls exactly one summary garbled a copied figure (hazard window "WP20–WP30" for a true WP23–WP31); the guard caught it and the retry passed. **Invented numbers can no longer reach a user.**

**Failure and fallback contract.** `generate_weather_summary_llama_3b` returns `None` on *any* failure — server down, model loading, timeout, or all attempts exhausted — so `weather.py` tries it first and falls back to the deterministic generator. Output flows through the same critic pipeline, so the existing validation still cross-checks it against the route data.

## Finding 3 — the guard was anti-correlated with the truth for waypoint claims

Found on review (2026-07-22), after the results below were collected. Two individually defensible details inverted the guard between them:

- The sample-row table is **downsampled to 12 rows on a uniform stride**, so on a 50-waypoint route the model sees roughly every fourth waypoint.
- Waypoint indices (`WP38`) were authorized into **the same flat pool of floats** as forecast figures.

Constructed case — 50 waypoints, wind peaking at 31.4 mph at WP38, which the stride misses and which sits below the 35 mph hazard threshold, so no hazard window pins it either:

| Model claim | Truth | Old guard | New guard |
|---|---|---|---|
| `31.4 mph at WP38` | correct | **rejected** (38 never authorized) | accepted |
| `31.4 mph at WP25` | wrong | rejected | rejected |
| `38 mph` (index used as a speed) | invented | **accepted** (38 in the number pool) | rejected |
| `33.0 mph` | invented | rejected | rejected |

The guard rejected the true attribution and separately let any waypoint index masquerade as a measurement — on a 50-waypoint route every integer from 1 to 50 was a legal wind speed. The peak *value* was never at risk (it is always in the digest); its *location* was unstated, leaving the model to guess.

**The fix — waypoint references get their own namespace.** `_Authorized.waypoint()` records the index in a `waypoints` set; the scanner resolves `WP\d+` tokens first and masks them whether authorized or not, so their digits never reach the number pool and an unauthorized reference is reported as `WP32` rather than the figure 32. Same root cause and remedy as the earlier ISO-timestamp leak, where an ETA of `2026-07-18T00:00:00Z` once authorized 2026, 18 and 0 as wind speeds.

**What the fix does not do** — two deliberate limits, each covered by a test named for the gap:

- **It does not bind a value to a waypoint.** Verification is set membership per token: was `31.4` given, was `WP32` given — never whether `31.4` belongs to `WP32`. WP32 *is* a sampled row, so misattributing the peak to it still passes.
- **It does not make an unsampled peak nameable.** `31.4 mph at WP38` stays rejected, correct though it is, because nothing in the prompt mentions WP38. This rarely fires in practice: the prompt gives no extreme locations, so the model has nothing to copy.

**A second fix was tried and reverted the same day** — annotating each statistics line with its extreme's location (`wind speed: 12.0 to 47.5 mph (max at WP11)`) plus a rule pinning the attribution. It closed the second limit and worked as designed, and was reverted anyway because it cost more than it bought. See "Cost of the extremes annotations" in the appendix.

**Generalizable lesson, and why this matters for the 8B work:** a verification allow-list must distinguish *kinds* of number. Pooling identifiers with measurements doesn't merely weaken the check — it can point it in the wrong direction, which is worse than no check, because the failures it passes are exactly the plausible ones.

## Final results (all routes, guard active)

- **Unauthorized numbers in served summaries: 0** (and structurally impossible going forward)
- Hazards all reported with correct magnitudes, waypoint spans, and timestamps; data gaps disclosed exactly
- Latency 4–8 s typical, ~13 s when a retry fires; length-independent
- Backend test suite: see status note below

**Test status (2026-07-22).** The module no longer sniffs for pytest; `LLM_SUMMARY_ENABLED=false` is the deliberate switch forcing the deterministic path, so the LLM route can also be exercised on purpose. `tests/test_llama_3b_generator.py` covers the digest, the guard, and the reverted annotations, and passes without a model server.

Two `tests/test_api.py` cases fail — `test_forecast_happy_path_envelope` and `test_summary_uses_current_table_values_without_fetching`. **This is the endpoint wiring, not the module:** `generate_weather_summary` is commented out in `weather.py`, so a `None` from the LLM path reaches the client as a null summary instead of falling back (with `LLM_SUMMARY_ENABLED=false` they fail as `TypeError: argument of type 'NoneType' is not iterable`). The deterministic generator's own 16 tests pass. **Restoring the fallback is a merge blocker** — the contract above depends on it.

## Residual limitations

1. **Omissions are the dangerous slip, and nothing catches them.** The number guard can't catch a wrong *word* ("no precipitation at any waypoint" beside correct numbers) and is structurally blind to a *missing* one, since it only inspects figures that are present. Demonstrated 2026-07-22: one extra prompt rule silently dropped a real hazard from a summary that verified clean. **Nothing checks that a listed hazard reached the output.** A deterministic hazard sentence, appended the way the data-gap note already is, is the single highest-value follow-up in this document.
2. **Prompt fragility** — small edits shift unrelated outputs; re-validate any prompt change against the full route matrix.
3. **The critic can't handle negation** — "precipitation is not expected" trips its rain-words check.
4. **8 GB RAM caps the model** — see the hardware section.
5. **Verification does not bind a value to a waypoint**, and an unsampled peak cannot be named at all — see Finding 3. Misattributing a correct figure to a real but wrong waypoint passes; correctly attributing one to an unmentioned waypoint is rejected.
6. **Sample-row selection is data-blind** — a uniform stride, so on long routes the model may see no waypoint inside a hazard window. It still describes the window correctly from the digest's span-and-ETA line; biasing the sample toward window endpoints would let it illustrate the stretch that matters. Low priority.
7. **The row cap is conservative by choice.** At 50 waypoints: 12 rows ≈ 918 prompt tokens, all 50 ≈ 1,655 — token budget is *not* binding. The reason to cap is that every rendered value is authorized, so showing all 50 grows the allow-list from 67 numbers to 192, roughly tripling the chance an invented figure coincidentally matches. Fewer rows is a stronger guard; more rows let the model cite more waypoints faithfully. Currently resolved toward the guard.

## Recommendations

1. Keep the **digest → generate → verify → fallback** architecture regardless of model or machine — it works unchanged against any OpenAI-compatible endpoint, and it is what makes the output trustworthy.
2. Trial Llama-3.1-8B or Qwen2.5-7B (Q4) on ≥16 GB hardware for prose quality; verification stays as the safety net. **In progress separately as an 8B module** — Finding 3 applies there unchanged and should be carried over rather than rediscovered, since the flaw is in the verification design, not the model.
3. Harden the critic's keyword matching (negation awareness).
4. For air-gapped deployment: copy the `.gguf` and run `llama-server -m <path>` — no network at any point.

---

## Appendix — two representative runs

Each run below is regenerated live against the model (`Llama-3.2-3B-Instruct Q4_K_M` on `llama-server`) for this report, and shows the full pipeline: the **waypoints** fed in, the **digest** built from them (every number the model is allowed to state), and the **summary** served after number verification.

> **Re-run 2026-07-22.** Both routes were regenerated end-to-end against `llama-server` from these exact waypoint tables, on the shipped code (waypoint-namespace fix in, extremes annotations reverted). Digests are byte-identical to the originals. Kodiak's summary reproduced byte-for-byte, confirming temperature-0 determinism across sessions; Norfolk's differs from the July 17 recording and is more complete — see below. Timings are warm (model already resident); a first request after starting `llama-server` adds ~13 s of model load.

### Norfolk–Azores storm route — 50 waypoints, 12.2 s

Synthetic transatlantic route with an elevated-weather band across WP24–WP32. Values ramp through that band, so only where they cross the thresholds (wind ≥ 35 mph, precip ≥ 0.25 in) — WP28–WP32 — does the digest raise a hazard window. The summary passed number verification on the first (temperature-0) attempt.

**Waypoints (input):**

```
 WP      lat      lon  eta (UTC)             temp  wind   dir precip  hum
-------------------------------------------------------------------------
  1    36.85   -75.98  2026-08-01T00:00:00Z    79     9   215      0   64
  2    36.87   -74.95  2026-08-01T03:00:00Z  79.2  10.3 218.6      0   65
  3    36.89   -73.93  2026-08-01T06:00:00Z  79.4  11.5   222      0   66
  4     36.9    -72.9  2026-08-01T09:00:00Z  79.6  12.4 225.2      0   67
  5    36.92   -71.87  2026-08-01T12:00:00Z  79.7  12.9 227.9      0   68
  6    36.94   -70.85  2026-08-01T15:00:00Z  79.7    13 230.1      0   69
  7    36.96   -69.82  2026-08-01T18:00:00Z  79.6  12.6 231.8      0   70
  8    36.98   -68.79  2026-08-01T21:00:00Z  79.5  11.9 232.7      0   70
  9       37   -67.77  2026-08-02T00:00:00Z  79.2  10.8   233      0   71
 10    37.01   -66.74  2026-08-02T03:00:00Z  78.9   9.6 232.5      0   71
 11    37.03   -65.71  2026-08-02T06:00:00Z  78.5   8.2 231.4      0   71
 12    37.05   -64.69  2026-08-02T09:00:00Z    78     7 229.6      0   71
 13    37.07   -63.66  2026-08-02T12:00:00Z  77.5     6 227.2      0   70
 14    37.09   -62.64  2026-08-02T15:00:00Z    77   5.3 224.3      0   70
 15     37.1   -61.61  2026-08-02T18:00:00Z  76.5     5   221      0   69
 16    37.12   -60.58  2026-08-02T21:00:00Z    76   5.2 217.5      0   68
 17    37.14   -59.56  2026-08-03T00:00:00Z  75.6   5.7 213.9      0   67
 18    37.16   -58.53  2026-08-03T03:00:00Z  75.2   6.7 210.4      0   66
 19    37.18    -57.5  2026-08-03T06:00:00Z    75   7.9   207      0   65
 20     37.2   -56.48  2026-08-03T09:00:00Z  74.8   9.2   204      0   64
 21    37.21   -55.45  2026-08-03T12:00:00Z  74.7  10.5 201.4      0   63
 22    37.23   -54.42  2026-08-03T15:00:00Z  74.7  11.6 199.3      0   62
 23    37.25    -53.4  2026-08-03T18:00:00Z  74.8  12.5 197.9      0   60
 24    37.27   -52.37  2026-08-03T21:00:00Z    75    30   243   0.15   80
 25    37.29   -51.34  2026-08-04T00:00:00Z  75.2  31.5   246   0.18   81
 26     37.3   -50.32  2026-08-04T03:00:00Z  75.4    33   249   0.21   82
 27    37.32   -49.29  2026-08-04T06:00:00Z  75.6  34.5   252   0.24   83
 28    37.34   -48.26  2026-08-04T09:00:00Z  75.8    36   255   0.27   84
 29    37.36   -47.24  2026-08-04T12:00:00Z    76  37.5   258    0.3   85
 30    37.38   -46.21  2026-08-04T15:00:00Z  76.1    39   261   0.33   86
 31    37.39   -45.18  2026-08-04T18:00:00Z  76.1  40.5   264   0.36   87
 32    37.41   -44.16  2026-08-04T21:00:00Z  76.1    42   267   0.39   88
 33    37.43   -43.13  2026-08-05T00:00:00Z  75.9   5.2 217.1      0   58
 34    37.45    -42.1  2026-08-05T03:00:00Z  75.7     5 220.6      0   59
 35    37.47   -41.08  2026-08-05T06:00:00Z  75.3   5.2 223.9      0   60
 36    37.49   -40.05  2026-08-05T09:00:00Z  74.9   5.9 226.8      0   61
 37     37.5   -39.02  2026-08-05T12:00:00Z  74.5   6.9 229.3      0   62
 38    37.52      -38  2026-08-05T15:00:00Z    74   8.1 231.2      0   63
 39    37.54   -36.97  2026-08-05T18:00:00Z  73.5   9.4 232.4      0   64
 40    37.56   -35.95  2026-08-05T21:00:00Z  72.9  10.7   233      0   66
 41    37.58   -34.92  2026-08-06T00:00:00Z  72.5  11.8 232.8      0   67
 42    37.59   -33.89  2026-08-06T03:00:00Z    72  12.6 231.9      0   68
 43    37.61   -32.87  2026-08-06T06:00:00Z  71.7    13 230.4      0   69
 44    37.63   -31.84  2026-08-06T09:00:00Z  71.4  12.9 228.2      0   69
 45    37.65   -30.81  2026-08-06T12:00:00Z  71.2  12.5 225.5      0   70
 46    37.67   -29.79  2026-08-06T15:00:00Z  71.1  11.6 222.4      0   71
 47    37.69   -28.76  2026-08-06T18:00:00Z  71.1  10.5   219      0   71
 48     37.7   -27.73  2026-08-06T21:00:00Z  71.2   9.2 215.4      0   71
 49    37.72   -26.71  2026-08-07T00:00:00Z  71.3   7.8 211.9      0   71
 50    37.74   -25.68  2026-08-07T03:00:00Z  71.5   6.7 208.4      0   71
```

**Digest (model input):**

```
ROUTE STATISTICS (use only these numbers):
- vehicle: USNS Comet
- route name: Norfolk-Azores
- waypoints: 50
- start: 36.85, -75.98 at 2026-08-01T00:00:00Z
- end: 37.74, -25.68 at 2026-08-07T03:00:00Z
- total distance: 2403 nm
- temperature: 71.1 to 79.7 F; trend falling
- wind speed: 5.0 to 42.0 mph; prevailing direction SW; trend falling
- precipitation: per-waypoint 0.00 to 0.39 in; total 2.43 in
- humidity: 58 to 88 %
- hazards: high winds (max 42.0 mph); wet conditions (max 0.39 in)
- hazard window: high winds: WP28 through WP32 of 50 (2026-08-04T09:00:00Z to 2026-08-04T21:00:00Z)
- hazard window: wet conditions: WP28 through WP32 of 50 (2026-08-04T09:00:00Z to 2026-08-04T21:00:00Z)
```

> The USNS Comet is expected to traverse a 50-waypoint route from 36.85, -75.98 at 2026-08-01T00:00:00Z to 37.74, -25.68 at 2026-08-07T03:00:00Z, covering a total distance of 2403 nm. Temperatures will range from 71.1 to 79.7 F, with a falling trend, while wind speeds will vary from 5.0 to 42.0 mph, prevailing from the southwest, also with a falling trend. Precipitation will range from 0.00 to 0.39 in, with a total accumulation of 2.43 in, and humidity will range from 58 to 88 %. High winds with speeds up to 42.0 mph and wet conditions with up to 0.39 in of precipitation are forecasted, with the hazard window for high winds occurring from WP28 through WP32 of 50 from 2026-08-04T09:00:00Z to 2026-08-04T21:00:00Z, and for wet conditions also from WP28 through WP32 of 50 from 2026-08-04T09:00:00Z to 2026-08-04T21:00:00Z.
>
> — AI-generated summary (model: bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M)

Accepted on the first (temperature-0) attempt, and confirmed deterministic — three consecutive runs produced byte-identical output. This is **more complete than the July 17 recording of the same route**, which named only the high-winds hazard window; this one states both windows explicitly, alongside both trends, the precipitation total, and both hazards. Four sentences, within the 3–5 budget.

### Kodiak–Aleutians missing-data route — 8 waypoints, 7.7 s

Nulls in temperature (WP2, WP6), wind/direction/humidity (WP3), and precipitation (WP4, WP7) — the API-failure shape. The digest computes each statistic only over the values that are present, and the trailing "Note:" sentence is appended deterministically in Python (not generated by the model).

**Waypoints (input):**

```
 WP      lat      lon  eta (UTC)             temp  wind   dir precip  hum
-------------------------------------------------------------------------
  1    57.79  -152.41  2026-08-05T00:00:00Z    52    18   200      0   78
  2     57.1   -150.9  2026-08-05T03:00:00Z     —    20   210   0.02   80
  3     56.4   -149.4  2026-08-05T06:00:00Z    50     —     —   0.05    —
  4     55.7   -147.9  2026-08-05T09:00:00Z    49    22   220      —   82
  5       55   -146.4  2026-08-05T12:00:00Z    48    21   215    0.1   81
  6     54.3   -144.9  2026-08-05T15:00:00Z     —    19   205   0.08   79
  7     53.6   -143.4  2026-08-05T18:00:00Z    47    17   200      —   78
  8     52.9   -141.9  2026-08-05T21:00:00Z    46    16   195   0.03   77
```

**Digest (model input):**

```
ROUTE STATISTICS (use only these numbers):
- vehicle: USCGC Munro
- route name: Kodiak-Aleutians
- waypoints: 8
- start: 57.79, -152.41 at 2026-08-05T00:00:00Z
- end: 52.90, -141.90 at 2026-08-05T21:00:00Z
- total distance: 464 nm
- temperature: 46.0 to 52.0 F; trend falling
- wind speed: 16.0 to 22.0 mph; prevailing direction SSW; trend falling
- precipitation: per-waypoint 0.00 to 0.10 in; total 0.28 in
- humidity: 77 to 82 %
- hazards: none
```

> The USCGC Munro will be traveling 464 nm from 57.79, -152.41 at 2026-08-05T00:00:00Z to 52.90, -141.90 at 2026-08-05T21:00:00Z. Temperatures will range from 46.0 to 52.0 F, with a falling trend. Wind speeds will be between 16.0 and 22.0 mph, with a prevailing direction from SSW, also falling. Precipitation will be between 0.00 and 0.10 in, with a total of 0.28 in. Humidity will range from 77 to 82 %. No hazards are indicated. Note: temperature missing at 2 of 8 waypoints; wind missing at 1 of 8 waypoints; precipitation missing at 2 of 8 waypoints; humidity missing at 1 of 8 waypoints; the narrative should be reviewed against the table before release.
>
> — AI-generated summary (model: bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M)

Byte-for-byte identical to the July 17 recording. All trends kept, `hazards: none` correctly stated as "No hazards are indicated.", and the gap note appended in Python rather than generated.

### Cost of the extremes annotations

**Tried 2026-07-22, reverted the same day.** The change annotated each statistics line with where its extreme occurred (`temperature: 71.1 to 79.7 F (min at WP46, max at WP5)`) and added a 14th strict rule pinning the attribution. Prompt cost: +256 characters, ~64 tokens, 6.7% — of which the *rule* was +202 and the data only +54.

It worked as designed. Across both routes the model named all eight extreme locations correctly and every figure verified clean. It was reverted because of what it displaced:

| | Without annotations | With annotations |
|---|---|---|
| Extreme locations named | none available | **all 8 correct** |
| Norfolk: trends stated | both | **neither** |
| Norfolk: hazards stated | high winds **+ wet conditions** | high winds only |
| Norfolk: precipitation total | 2.43 in | **absent** |
| Kodiak: "no hazards are indicated" | present | **absent** |
| Numbers verified | clean | clean |

The mechanism: the digest carried more required content while the instruction still asked for 3–5 sentences, so the extremes displaced trends, hazards, and a route total rather than adding to them. Every dropped item is a rule the prompt states explicitly — Finding 1's lesson again, that a 3B model follows instructions probabilistically, so a 14th demand makes the other 13 likelier to be dropped. None of it is visible to the number guard, which only ever sees figures that *are* present.

**Why it was not worth re-tuning to keep.** The annotation is most informative exactly when it matters least. A peak that crosses a hazard threshold is already pinned by its hazard window, so naming it again is redundant; a peak that does not cross is, by definition, not hazardous. On Kodiak the temperature route falls monotonically, so "min at WP8, max at WP1" only restates that it is a falling trend. The one scenario the annotation genuinely adds information to — a sub-threshold peak at an unsampled waypoint — is the scenario where the information does not matter.

Against that, a dropped wet-conditions hazard is an operational omission on a route where the vessel meets 42 mph winds and 0.39 in of rain.

**Left in place:** a regression test (`test_digest_does_not_annotate_extreme_locations`) and a comment at the former call site, so the idea is not reintroduced without re-reading this section.
