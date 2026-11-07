# GROOVEPRINT 3.0 — Musical tempo validation: first evidence report
Date: 2026-11-07. Scope: **synthetic development benchmark only**.

## Verification status

- Repository: `mitaofficial/grooveprint`; PR #3; branch `feature/bpm-intelligence-3-open-data`.
- 168 rhythmically structured synthetic cases with known constructed BPM, plus one steady/nonrhythmic case.
- No third-party audio was downloaded. No real commercial music or vinyl transfers were supplied.
- Real-audio musical accuracy, genre-specific accuracy, memory stress tests and live browser codec performance: **NOT TESTED**.
- Original production DSP remains unchanged at `src/bpm-tempo.mjs`. The challenger is *separate*, `src/bpm-tempo-experiment.mjs`.
- Synthetic suite was used for the experimental iterations, **so this is development-set performance, not independent held-out validation**.

## Baseline versus experimental candidate (CI development run #67, test job)

| Metric | V1 baseline | V2 experiment |
|---|---:|---:|
| Synthetic cases with reference BPM | 168 | 168 |
| Predictions / coverage | 154 / 91.67% | 168 / 100% |
| Primary BPM within ±1 BPM (predictions only) | 49.35% | 93.45% |
| Correct BPM among candidates ±1 | 71.43% | 100% |
| Half/double-time errors (predictions only) | 50.65% | 6.55% |
| Unflagged half/double-time errors (auto-accepted only) | 50.63% | 0% |
| Auto-accepted predictions / evaluated tracks | 79 / 168 (47.02%) | 36 / 168 (21.43%) |
| Accuracy ±1 among auto-accepted predictions | 49.37% | 100% |
| MAE, among produced predictions | 39.22 BPM | 5.00 BPM |
| Median absolute error | 60 BPM | 0.02 BPM |
| Mean detector runtime per case in CI | 0.86 ms | 3.33 ms |
| Sampled process RSS (not peak or per-track isolated) | 88.13 MB | 88.14 MB |
| Unavailable across all 169 examples | 14 | 1 |

**Do not read these numbers as an estimate of commercial-music precision.** They represent synthetic development fixtures only; CPU runtime and RSS depend on CI hardware. The nonrhythmic fixture is now rejected by V2 after a dedicated regression test.

## Known error taxonomy — 11 recorded V2 primary BPM mistakes

The remaining mistakes are all octave-related and **flagged for manual review**. The correct value appears as an alternative, but the selected primary BPM is too low:

| Synthetic fixture | Reference BPM | Suggested BPM | Review |
|---|---:|---:|---|
| sparse-120 | 120 | 60 | Yes |
| sparse-128 | 128 | 64 | Yes |
| sparse-136 | 136 | 68 | Yes |
| sparse-138 | 138 | 68.98 | Yes |
| sparse-140 | 140 | 70.01 | Yes |
| sparse-145 | 145 | 72.49 | Yes |
| sparse-150 | 150 | 75 | Yes |
| sparse-160 | 160 | 80 | Yes |
| sparse-174 | 174 | 86.98 | Yes |
| hats-dominant-174 | 174 | 86.98 | Yes |
| sparse-200 | 200 | 100 | Yes |

The sparse fixtures alternate kick and snare rather than offering a strong kick every beat; this makes half-tempo periodicity musically plausible to the detector. The hats-dominant example contains strong competing rhythmic accents. A review warning is appropriate, but it does **not** solve the top-1 error.

## Changes evaluated

The V2 experiment uses independent-channel onset energy to avoid sample-level stereo phase cancellation, low-band and broadband features, approximately 200 Hz onset sampling, local lag-peak refinement, and a gate for steady signals with insufficient transient contrast. A conservative octave-ambiguity check avoids silently accepting competing tempo interpretations.

The objective is honest uncertainty, not arbitrary 130–150 BPM genre bias. Both V1 and V2 continue to lack independently calibrated confidence probabilities.

**Major limitation:** V2 auto-acceptance covers only 21.43% of the synthetic known-tempo cases. Its 100% auto-accepted accuracy therefore reflects a narrow subset, not universal success. The review flow needs both musical accuracy and usable coverage on held-out recordings before a production decision.

## Quality and privacy controls

- The new Node synthetic benchmark is deterministic and writes `summary.json`, `results.csv` and `report.md` under ignored `.private/benchmarks/`.
- A local real-recording manifest requires independent `groundTruthBpm` and `verificationMethod`. Unverifiable tracks are excluded from accuracy denominators.
- A separate local Chromium runner is supplied for `AudioContext.decodeAudioData()` evaluation. Real files remain on the local device.
- BPMs marked `manual` or `verified` must never be silently replaced by a catalog or DSP estimate.
- No audio files or raw waveforms are committed or uploaded. Test data is original synthetic signal.

## Release decision

**FAIL for production / EXPERIMENTAL for continued R&D.** Even though the V2 synthetic results improved substantially over the baseline, a representative real-audio evaluation does not exist. Do not merge the experimental module into the production detection path, do not deploy, and do not sell BPM results as verified.

## Remaining work — hard gates

1. Assemble at least 120 authorized tracks across techno, hardgroove, tribal, old-school vinyl, house, breakbeat, DnB and nonrhythmic material. Verify ground truth with DAW over several sections; set aside a genuine hold-out split.
2. Run `npm run benchmark:real` and `npm run benchmark:browser` on the same collection, report codec failures and resampling differences.
3. Validate octave mistakes on real sparse kick, percussion-heavy and triplet patterns; measure accepted precision together with accepted coverage.
4. Benchmark sequential 10/100/500/1500-file workflows on actual end-user hardware and browsers, including cancellation, RAM usage, file identity and Discogs source expiry during analysis.
5. Calibrate any confidence/auto-accept policy on separate ground-truth data. Do not fabricate confidence percentages.
6. Preserve unchanged baseline and ensure `npm test`, syntax and Chromium smoke stay green throughout.
