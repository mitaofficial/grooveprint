# GROOVEPRINT V3 — decision-level BPM checkpoint (8 November 2026)

**Status: EXPERIMENTAL / PARTIAL. Do not merge or auto-accept BPM.**
Feature branch: `feature/bpm-intelligence-3-open-data`; PR #3 (Draft); protected `main` baseline `28f9fd9ed699ec13c4ab4108ca2266159715e73c`.
Starting feature SHA for this work: `c2e97b36b4650e772c46bd1438b1719eaefc8721`. The latest feature SHA and **its exact CI** must be checked at handoff. No production/Railway deploy, third-party BPM dependency, new license agreement, or source-access bypass.

## 1. Reproduced technical cause and audio hypothesis

Previously `src/bpm-worker-dev.mjs` concatenated four V1 onset-ACF maxima with four V2 ACF maxima. `index.html` rendered every maximum as a separate `SCEGLI STIMA` button. That is *a list of possible onset periodicities*, not a decision about musical tactus. Correlation magnitude is not a calibrated probability, and duplicate/related peaks are not eight independent BPM ground truths.

On the **real authorized recording** Josh Woodward — *Fight the Sea*, V1 produced **100 BPM**, V2 **66.7 BPM**. The ratio is about 3:2, **not** an ordinary 2:1 half/double relationship. In the live Chromium check, three V2 temporal windows produced onset periodicity candidates **153.79, 194.59, and 66.07 BPM** (0–24, 78–102, 156–180 seconds). These inconsistent numerical windows explain **why the evidence does not currently justify a single principal tempo**. They are *detector hypotheses*, not an independently transcribed beatgrid or actual tempo changes. A public ~100 BPM reference is exploratory only; the algorithm contains no rule for this title or the reference.

The experimental V2 detector's `requiresReview` can also be true on a stable, correctly measured 4/4 loop. Treating this flag as absolute proof of a wrong tempo made V3 abstain on all 31 publisher-labelled techno loops. A narrowly scoped correction now recognizes V2's signal-derived `selectedFromHarmonic`: the higher integer-related beat may be proposed only if independent low-band **and** broadband onset support selected it and separate audio windows remain stable. No genre/BPM prior is used. This is still development logic, not a production-approved confidence model.

## 2. Implemented (experiment only)

- `src/bpm-decision.mjs`: deterministic V3 decision contract `supported` / `ambiguous` / `undetermined`; handles same-pulse, 2:1, 3:2 and 3:1 relations and abstains where agreement or temporal coherence is missing. `suggestedBpm` is **null** for ambiguity/undetermined; all decisions require explicit human review. No numerical confidence percentage.
- `src/bpm-compare-v3.mjs`: V1 and V2 on copies of identical PCM, then independent non-overlapping V2 window checks (2 windows on sufficiently long short files, 3 on >=72-second files); uses the existing browser decoder/worker path. `src/bpm-worker-dev.mjs` now imports this testable module.
- `src/bpm-library.js`: attaches structured decision evidence to the existing review-only result, does **not** overwrite user-entered/verified BPM.
- `index.html`: in V3 comparison mode displays **ONE BPM SUGGERITO** when supported with **one manually confirmed choice action**, otherwise **TEMPO AMBIGUO** or **TEMPO NON DETERMINABILE** with **zero numerical action buttons**. Up to two competing hypotheses remain inside optional technical diagnostics. BPM numerical field is not silently assigned; manually edited values are not automatically labelled verified. Data normalization bounds retained decision metadata; old V1-only mode has existing behavior.
- `server/app.mjs` serves V3 modules only from the development server; `scripts/build-local-preview.mjs` packages them for the opt-in local HTML comparison. The production V1 worker and baseline DSP were not changed.
- `src/bpm-tempo-v3.mjs` is a benchmark-only adapter (returns unavailable on abstention), not a production detector.
- `tests/bpm-v3-decision.test.mjs`, `tests/bpm-engine.test.mjs`, `tests/review-output.test.mjs`, `tests/browser-smoke.mjs` verify 3:2 abstention, temporal agreement, band-supported octave hypotheses, absence of eight choices, manual BPM preservation, portable HTML JSON roundtrip and PDF. `scripts/bpm-compare-e2e.mjs` executes 10 legacy + 10 fresh fixture browser sessions in each of Chromium/Firefox/WebKit, plus a separate **live real-provider Chromium** click/decoding/worker run with screenshots, network trace and structured V3 decision. Raw peak lists remain internal for diagnostics.

This is **not** a new auto-assignment policy. The legacy production detector is untouched and no BPM is silently assigned as `verified`.

## 3. Measured development comparisons (same inputs, ±1 BPM)

**A. 168 deterministic synthetic rhythmic cases** (development, **NOT** unseen holdout; one separate nonrhythmic case excluded from denominator; 180-second cap per analysis):

| Engine | Numerical proposals / 168 | Proposals correct ±1 BPM | Correct among proposals | Overall correct coverage | Half/double errors |
|---|---:|---:|---:|---:|---:|
| V1 | 154 | 76 | 49.35% | 45.24% | 78 |
| V2 | 168 | 158 | 94.05% | 94.05% | 10 |
| V3 conservative decision | **26** | **26** | **26/26** | **15.48%** | **0 among proposals** |

V3 accepts **zero** predictions without human review. These are signal-generator tests used for design decisions; 26/26 **does not** establish real-music precision. The small supplemental 12-case synthetic check likewise obtained 5 proposals, 5 matching their generator BPMs, but it is not independent evidence.

**B. 31 authorized WaivOps / Patchbanks EDM-TECH CC BY 4.0 real four-bar loops**. Labels are **publisher supplied**; the clips were repeated to exceed the detector's audio-duration minimum. Therefore **NOT** independently validated full tracks and **NOT** a holdout:

| Engine | Proposed / 31 | Within ±1 BPM of producer label | Precision vs producer labels among proposals | Overall correct coverage |
|---|---:|---:|---:|---:|
| V1 | 31 | 19 | 19/31 (61.29%) | 61.29% |
| V2 | 31 | 31 | 31/31 (100% label agreement) | 100% |
| V3 conservative decision | **8** | **8** | **8/8** | **25.81%** |

V3 abstains on **23/31**. Neither 8/8 nor 31/31 allows a claim of 100% accuracy on independently verified full recordings. Strong precision comes with a considerable coverage cost. False abstention, metrical-family errors and unpredictable arrangements remain open. The preliminary product goal of >=95% accuracy at useful coverage is NOT VALIDATED. No held-out, pre-registered independently verified benchmark was available for this work.

**C. Real live Chromium rights-checked album control** — https://github.com/mitaofficial/grooveprint/actions/runs/42526711486 :

- **14/14 tracks processed, 13 review candidates, 1 unavailable, 0 errors**; on the first recording `bpm=null`, `decision.status='ambiguous'`, `suggestedBpm=null`, `metricalRelation='three-to-two'`, 3 inconsistent windows (153.79/194.59/66.07 as above).
- Real browser evidence `decisionUi.status='ambiguous'`, `suggestedButtons=0`, `legacyChoiceRows=0`. Both V1/V2 algorithms execute; owned `AudioContext` and workers return to zero.
- Live screenshots and sanitized report (GitHub Actions artifact, finite retention): https://github.com/mitaofficial/grooveprint/actions/runs/42526711486/artifacts/13635607636
- Controlled native-decoder/worker/replay screenshots: Chromium https://github.com/mitaofficial/grooveprint/actions/runs/42526711486/artifacts/13636195504 ; Firefox https://github.com/mitaofficial/grooveprint/actions/runs/42526711486/artifacts/13635278122 ; WebKit https://github.com/mitaofficial/grooveprint/actions/runs/42526711486/artifacts/13635692404 .

These artifact URLs document a verified **earlier intermediate SHA `113fcd8...`**. After this checkpoint and any final code changes, reference final-head CI separately and do not reuse intermediate passes as final-head certification.

## 4. Strict acceptance and unresolved scope

**Implemented / tested:** no user-facing eight-candidate buttons in V3 comparison, genuine nontrivial abstention, bounded structured diagnostics, manual BPM protection, V1 baseline preserved, authorized Discogs-to-audio pilot, no new external BPM provider or target-BPM title cheat.

**Not completed / NOT validated:** independently verified full-length hardgroove/techno beatgrids, an untouched track-group holdout, calibration of V3's supported/ambiguous rule, useful acceptance coverage across genres, physically testing the user's exact Windows browser profile, physical print tests, hosted external preview. Do NOT automatically confirm, deploy, or merge based on these scores. V3 is an **opt-in development research comparison**; the default V1 remains unchanged. Do not label any `supported` V3 estimate as `verified`.

**Next legitimate accuracy gate:** curate authorized full recordings, record independent DAW beatgrids for 3 or more sections, mark a grouped holdout before tuning, run `npm run benchmark:v3:real` (private manifest) alongside V1 and V2 with failure/abstention denominators. Compare precision/coverage curves, per-genre slices, 2:1 and 3:2 errors, windows, runtime and memory. If insufficient performance, **retain the abstention** rather than forge accuracy or trim the failing tracks. The internet research adapter still cannot guarantee legal audio for commercial Discogs items.

## 5. Exact checkout / local preview handoff

In Windows PowerShell, inside the already cloned `grooveprint` directory, back up user-owned JSON if desired; `git status --short`, stop the server with Ctrl+C, run `git pull --ff-only`, check `git rev-parse --short HEAD`, then `npm run dev`; open `http://127.0.0.1:4173/` and Ctrl+F5. In REVIEW press **CONFRONTA V1/V2 CON AUDIO AUTORIZZATO** once on an eligible public demo. After it finishes, open **VEDI RISULTATI BPM**: V3 decision is visible as one supported proposal or an explicit abstention. The local loopback address is **not** an externally hosted preview.

Never reset forcefully or overwrite local user changes. If the test is blocked by the external source, report actual phase/error and do not claim success. All branch changes are isolated to PR #3.
