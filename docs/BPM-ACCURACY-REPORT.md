> Historical record: the catalog-provider design below was superseded on 2026-11-07. GetSongBPM is removed from active integration. Follow ARCHITECTURE.md, BPM-INTELLIGENCE.md and WORK-CHECKPOINT.md for the current product. Old key/backlink instructions are not active setup steps.

# BPM accuracy report

**Status: NOT VERIFIED ON REAL AUDIO.** No labeled corpus of techno, hardgroove, tribal, house or vinyl rips was tested as part of the zero-click change. No percentage accuracy is claimed.

Automated tests validate only metadata evidence selection: exact artist/title, separate remixes, conflicting BPM values, Various Artists and preservation of manual corrections. These tests do NOT measure onset detection, beatgrid quality or tempo accuracy.

Before deploying any enhanced DSP component: assemble a legally usable reference dataset with verified BPM and mixed musical content; report accuracy within ±1 and ±2 BPM, half/double errors, false matches, no-result rate, runtime and confidence calibration. Track audio source licenses.

## Observed public-audio spot check (2026-11-08)

**Not a validated accuracy benchmark.** A real user exercised the development-only rights-checked Discogs -> open-audio -> on-device DSP workflow with Josh Woodward's *Crawford Street*, Discogs release `3759149`. Their browser showed **14/14 tracks processed**, **13 with BPM candidate sets**, **1 without an applicable source/estimate**, and **0 processing errors**. These are coverage counters, not accuracy results.

For `Fight the Sea`, the user-visible V1 onset-autocorrelation candidate list (first 180 seconds) was:

| Rank | Candidate BPM | Normalized autocorrelation peak | Interpretation |
|---|---:|---:|---|
| 1 | 100 | 0.440 | Strongest detected periodicity; **not independently audio-verified** |
| 2 | 206.90 | 0.429 | Competing periodicity |
| 3 | 193.55 | 0.428 | Competing periodicity |
| 4 | 67.42 | 0.425 | Competing periodicity |
| 5 | 200 | 0.418 | Possible double-pulse relationship to 100 |
| 6 | 127.66 | 0.416 | Competing periodicity |

External cross-checks both report approximately **100 BPM**, agreeing with V1's top candidate: [Chordify](https://chordify.net/chords/josh-woodward-songs/fight-the-sea-chords) (100 BPM) and [ChordU](https://chordu.com/chords-tabs-fight-the-sea-josh-woodward-id_vunp_zc71Pc) (99.95 BPM). Their original verification methodology is unknown and they may not represent independent beat annotations. Neither substitutes for a manually checked audio beatgrid. The source release and licensing can be checked on [Free Music Archive](https://freemusicarchive.org/music/Josh_Woodward/Crawford_Street/). **No reference site is used by the internal detector or assigned automatically in the product.**

### Implications and next evidence gate

- A correct **top-1 example** does not validate the algorithm generally: the six peak strengths are close, and they are *not* calibrated probabilities. No automatic acceptance rule follows from this spot check.
- Keep user-confirmed BPM protected, preserve explicit review on all automatically researched tracks, and never silently assign a non-verified estimate to a printed label.
- On a pre-registered legally usable test set with independently checked beatgrids, run **V1 and V2 on exactly the same audio** and report separately: source-match coverage, top-1 within ±1 and ±2 BPM, existence of correct top-6 candidate, half/double-time confusion, false positive/no-result rate, per-genre slices, and median/95th percentile runtime.
- Analyze stability across distinct song segments and distinguish half/double-pulse families in diagnostic UI **only after** the benchmark establishes they improve accuracy and reduce overconfidence; do not treat peak correlations as certainty estimates.
- Do not claim commercial techno/hardgroove Discogs BPM coverage based on this licensed indie folk recording. Source availability for commercial tracks is a separate unresolved issue.
