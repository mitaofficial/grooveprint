# GROOVEPRINT — BPM V3 musical decision checkpoint
**Date:** 2026-11-08
**Branch:** `feature/bpm-intelligence-3-open-data`; PR #3, protected `main` unchanged.
**Frozen comparison source HEAD before the additional noise-state regression:** `7007d78b5bc7e29527c95d9ad2be480e597719d3`, CI #199 success: https://github.com/mitaofficial/grooveprint/actions/runs/42527224547

## Root cause: one musical decision was missing
Old `src/bpm-worker-dev.mjs` concatenated four V1 and four V2 autocorrelation peaks. These were eight **periodicity hypotheses**, not eight independently established musical beats. Their relative correlations were not calibrated probabilities; the UI falsely presented an array of musical decisions. V1 and V2 also have different onset extraction/frame rates/metrical selection criteria, so direct peak strength cross-engine ranking is not statistically valid.

The real authorized recording **Josh Woodward — Fight the Sea** is a decisive negative control for V3. Live Chromium at CI #199 recovered/analyzed 14/14 release tracks, 13 review cases, 1 without source, 0 processing errors. For the first track, V1 emitted **100 BPM**, V2 **66.7 BPM** (3:2 ratio, *not* an octave). Three V2 24-second windows gave **153.79 / 194.59 / 66.07 BPM**. The window evidence is not stable. V3 therefore emitted **ambiguous**, **null suggested BPM**, reason `discordant-three-to-two`, and zero visible candidate-action buttons. The system does NOT assert the true musical tempo and does not tune to a title/genre/provider BPM. Evidence: https://github.com/mitaofficial/grooveprint/actions/runs/42527224547/artifacts/13636041936

## Implemented
- `src/bpm-compare-v3.mjs`: original V1 and experimental V2 analyze separate copies of the same source PCM; V2 also analyzes temporal windows. The original standalone production worker is not replaced.
- `src/bpm-decision.mjs`: evidence-based decision with metrical families (same, half/double, 3:2, triple, unrelated), cross-engine agreement, band-supported harmonic distinction and temporal stability; it **abstains** when evidence is contradictory. A supported estimate remains manual-review only.
- `src/bpm-worker-dev.mjs`: calls the V3 comparison. Raw peaks remain internal diagnostics but no longer drive the primary UI.
- `index.html`: one supported BPM or an ambiguous/undetermined status with technical details collapsed. Never eight primary actions, never silent BPM verification or forced overwrites.
- Additional no-beat fix following CI #199: if V2 explicitly found no rhythmic onsets/contrast and V1 emitted a spurious periodicity, classify `undetermined`, not `ambiguous`. Do not apply this inference to generic decoder/unavailable failures. Added unit and development benchmark regression assertions.

## Experimental evidence, with fixed denominators

| Source / experiment | V1 | V2 | V3 |
|---|---:|---:|---:|
| Generated development patterns, top-1 within ±1 BPM (out of 12) | 6/12 | 10/12 | 5/12 |
| Generated development patterns, V3 proposals | — | — | 5/12 (41.67% coverage) |
| Generated development patterns, V3 correctness conditional on proposal | — | — | 5/5 (100% *on this small development set*) |
| CC BY 4.0 WaivOps EDM-TECH repeated four-bar loops, publisher label within ±1 BPM (out of 31) | 19/31 | 31/31 | 8/31 |
| Same WaivOps loop pilot, V3 proposal coverage | — | — | 8/31 (25.81%) |
| Same WaivOps loop pilot, V3 label agreement conditional on proposal | — | — | 8/8 (100% *on non-independent publisher labels*) |

These 31 examples are repeated short music loops, labeled by the publisher, **not 31 independent full-length DJ tracks**, and the same material has already been used in development. The 12 deterministic examples are synthetic and likewise not untouched holdout. A 100% ratio on eight examples is not a defensible 95% accuracy guarantee. The current V3 is **conservative and under-covered**; do not claim it is generally more accurate than V2 or ready for automatic release.

The broader 168-synthetic-case V2 benchmark had 158/168 correct ±1 (94.05%) on synthetic data, but this does not transfer to full-track accuracy. A V3 experimental adapter is available for matched-input comparisons, not production use.

## Release gates NOT satisfied
1. An authorized corpus of complete, version-identified techno/hardgroove and other recordings with independently confirmed beat grids and reference BPM.
2. A pre-registered, grouped **untouched** holdout with reported ±1/±2 BPM, double/half/3:2 errors, coverage, selective precision, false abstentions and confidence intervals.
3. Stable user-device/local profile evidence in addition to runner desktop/mobile browser simulations. No public HTTPS feature preview was deployed.
4. Musical accuracy policy for **automatically accepted** BPM. Current UI strictly requires human review and never marks DSP tempo verified.

## Guardrails
No genre prior, no catalog BPM substitution, no per-song exception, no hardcoding for this first track; no bypass of FMA/Archive audio rights checks; no provider/API secret changes; no merge or Railway production deployment.

Run locally after a clean fast-forward: `git pull --ff-only`, `npm run dev`, open `http://127.0.0.1:4173/` and Ctrl+F5. The visible Preview commit must match the Git branch HEAD. All new CI conclusions must match the **final** commit SHA, not the historical #199.
