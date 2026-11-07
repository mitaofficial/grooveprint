# GROOVEPRINT — rights, datasets and recorded-audio pilot
Verified: 2026-11-07

**Decision: EXPERIMENTAL.** This is a technical source review, not legal advice.

## Source and licensing matrix

| Source | Rights / availability evidence | Recommended use |
|---|---|---|
| WaivOps EDM-TECH | CC BY 4.0 per publisher; 11,270 produced four-bar techno drum loops at 128–150 BPM with paired metadata. https://zenodo.org/records/17584890 | Licensed pilot, with credit. Publisher labels are **not independently confirmed BPM** |
| WaivOps EDM-TR9 | CC BY 4.0; 3,780 TR-909-inspired rhythmic loops at 120–140 BPM. https://github.com/WaivOps/WaivOps-EDM-TR9 | Additional old-school test once files are available |
| WaivOps EDM-HSE | CC BY 4.0; house loop corpus; authors warn about occasional defects. https://github.com/WaivOps/WaivOps-EDM-HSE | Additional rhythm coverage; audit label accuracy |
| GiantSteps Tempo | 664 Beatport previews and tempo annotations. Official repo points to old audio downloader, but current mirdata loader says audio is unavailable. https://github.com/GiantSteps/giantsteps-tempo-dataset and https://github.com/mir-dataset-loaders/mirdata/blob/master/mirdata/datasets/giantsteps_tempo.py | **Do not automatically download** without confirmed permissions. Annotation-only data is not audio validation |
| FMA | Track-by-track rights differ, though many tracks use CC licenses. https://github.com/mdeff/fma | Manually selected rights-cleared full-track recordings; reference BPM still needed |
| Beat This! | MIT code and published weights; upstream discloses some training data copyrighted or restricted, and provides ~8 MB small and ~78 MB full checkpoints. https://github.com/CPJKU/beat_this | Evaluate as an *isolated* research candidate; commercial provenance and browser deployment not approved |
| Essentia.js | AGPL-3.0 package; UPF offers commercial licensing. Some models and dependencies have separate restrictions. https://essentia.upf.edu/licensing_information.html | **Do not embed** into closed commercial SaaS before license agreement and dependency review |
| librosa | ISC license. https://github.com/librosa/librosa/blob/main/LICENSE.md | Permissive Python reference implementation, not native browser DSP |
| aubio | GPLv3 or later. https://github.com/aubio/aubio | Research reference only unless compatibility is approved |
| MusicBrainz API | Free non-commercial API; commercial use needs arrangements. Core database dumps are CC0, supplementary content has separate NC restrictions. https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/About/Data_License | No unlicensed commercial live queries. Offline CC0 core data is a distinct option |
| AcousticBrainz | Historical algorithmic values, exact MBID needed by the current adapter; collection stopped in 2022. https://tempopeek.com/about | Archived catalog evidence, not proof of user-measured tempo |
| GetSongBPM | Optional provider; requires configured access and contractual review | Keep optional; no invented fallback |

## Measured real-produced audio pilot

Runner: `scripts/waivops-pilot.mjs`, triggered by `npm run benchmark:licensed-techno` and GitHub Actions job `licensed_audio_pilot`.

Source pinned to public WaivOps example repository commit:
`fc8c78939c4cc1ceec664d0ed5feda6b8f44960d`.

Test inputs: 12 CC BY 4.0 MP3 techno drum-loop examples with BPM labels 128, 132, 134, 135, 136, 137, 138, 139, 140, 142, 145 and 148. Each public example is downloaded from an explicit allowlist; no other arbitrary URLs, no Discogs collection and no user audio. Audio is stored only under ignored `.private/` in the runner and not uploaded as CI artifacts.

The original four-bar clips are shorter than V1's eight-second minimum. After local FFmpeg decoding, PCM samples are repeated to at least 20 seconds. This is a synthetic *temporal extension of real produced audio*. The evaluation does **not** measure performance on untouched full-length songs.

### Results: GitHub Actions #72, 2026-11-07

| Publisher-label agreement | V1 original | V2 experimental |
|---|---:|---:|
| Files decoded | 12/12 | 12/12 |
| Primary BPM within ±1 of published label | 58.33% | 83.33% |
| Published BPM among candidates within ±1 | 58.33% | 100% |
| Half/double-rate first-choice errors | 41.67% | 16.67% |
| Auto-accepted count | 2 | 0 |
| Auto-accepted coverage | 16.67% | 0% |
| Unflagged octave errors | 2 | 0 |

**These are publisher-label agreements, not independent ground-truth tempo accuracy.** The 12 examples were *selected* from the publisher's 31 examples and do not constitute a representative held-out sample. The V2 result shows improved candidate selection but a wholly unusable zero-percent automated acceptance on this pilot.

CI run: https://github.com/mitaofficial/grooveprint/actions/runs/42360895838

### Next non-negotiable experiments

1. Obtain at least 30 authorized *full-length* real tracks and derive BPM references independently using DAW beat-grid checks over distant song positions. Add drum-only and complex tribal cases.
2. Test untouched short audio and full tracks separately, and benchmark true multiphase window selection rather than only the beginning of a track.
3. Evaluate V1, V2 and one independent engine (Beat This only after training-rights review, or local librosa as reference) on **identical verified audio**. Record source/CPU/RAM and version.
4. Hold out independent masters and versions; don't use test songs to tune auto-review policy.
5. Measure the precision-vs-coverage curve for automated acceptance; keep ambiguous octave families in REVIEW.
6. Confirm the commercial rights posture before shipping external code, model weights or catalog data.
7. Only after production thresholds and licensing are met, consider a feature-flagged integration. Never overwrite manual BPM values.

**Product definition:** metadata-only BPM coverage is limited by the licensed sources available; audio-based estimation requires a recording. In both cases, prefer an explicit missing BPM to an unsupported guess.

## Attribution

WaivOps / Patchbanks. *WaivOps EDM-TECH: Open Audio Resources for Machine Learning in Music* (2025). DOI https://doi.org/10.5281/zenodo.17584890, licensed CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ . The pilot locally decodes and repeats published MP3 examples for tempo testing; this modification is disclosed. No dataset audio is redistributed with GROOVEPRINT.

## Expanded publisher-label evaluation: all 31 examples

GitHub Actions: https://github.com/mitaofficial/grooveprint/actions/runs/42361407681

The selected initial 12 examples have now been supplemented by the complete set of **31 public MP3 example files** in WaivOps EDM-TECH at the pinned GitHub commit. This is an *expanded developer evaluation*, and does not supersede the distinction between a publisher-labelled loop and an independently verified full song.

| Publisher-label diagnostic | V1 | V2 |
|---|---:|---:|
| Decoded / attempted | 31 / 31 | 31 / 31 |
| Primary tempo within ±1 BPM of publisher label | 61.29% | 74.19% |
| Publisher BPM present among candidates ±1 | 61.29% | 96.77% |
| Half/double tempo errors | 38.71% | 25.81% |
| Unflagged half/double errors | 6 | 0 |
| Auto-accepted count | 6 | 0 |
| Automatically accepted coverage | 19.35% | 0% |
| Reported independent accuracy | **NOT TESTED** | **NOT TESTED** |

V2's eight primary mismatches all concern the half-tempo alternative. Source labels affected: 135 BPM (two cases), 137 BPM (four cases) and 142 BPM (two cases). In all eight, the system marked the result for human review. The alternative list contains publisher-tempo candidates for most errors, but the V2 overall top-six candidate match is not perfect (96.77%).

**Important product conclusion:** V2 is currently better at finding plausible tempo evidence and flagging risk, but its existing review rules accept 0/31 of these producer-labelled rhythmic examples automatically. Therefore, V2 is **not deployable as a hands-free BPM Pro engine**. Do not fix this by blindly lowering the thresholds on these exact 31 examples; use independent full-length development and held-out datasets to calibrate an actual precision–coverage operating point.

The latest full CI (unit tests, browser, provider and publisher-labelled audio pilot) was successful. This verifies the infrastructure and labeled-loop evaluation, not professional BPM accuracy.
