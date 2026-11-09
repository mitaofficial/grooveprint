# GROOVEPRINT V4 — beat-grid research and independent validation checkpoint
**2026-11-09 · EXPERIMENTAL ONLY · NO RELEASE/PRODUCTION APPROVAL**

## Scope and preserved baseline
- Repository `mitaofficial/grooveprint`; authorized PR #3 branch `feature/bpm-intelligence-3-open-data`. Frozen baseline HEAD before V4 research: `8eea6a52503ab426d528a600673e996a52d2a4b4`.
- V1 energy/onset RMS autocorrelation, V2 multiband ACF with harmonic evidence, and V3 cross-check/temporal windows are **unchanged**. No direct wiring to `index.html`, `src/bpm-auto.js`, the production worker or Railway.
- Every newly introduced V4 result is marked **research-only**, uncalibrated and **requires human review**. No use of Discogs/Beatport BPM labels in detection, no genre prior, no secret provider or unlicensed audio access.

## Experiment: what was actually implemented
`src/bpm-beatgrid-v4.mjs` adds an independently scored *beat-path* to periodicity hypotheses:

1. Compute bass and broadband onset activation from PCM with normalized frame-level attacks (100 Hz analysis grid). P99 normalization, rather than P95, avoids treating sparse kick signals as completely empty.
2. Generate candidate tempos using the existing V1/V2 onset-ACF proposals. **This is not independent tempo induction** and is a known limitation.
3. For each candidate, use event-to-event dynamic programming with one-to-four-beat transitions, skip penalties and normalized phase-jitter penalties to construct an ordered sequence of beats. Unlike ACF alone, it returns beat timestamps, observed/missing beat counts, occupancy and measured phase drift.
4. Evaluate whether each beat path explains not only selected strong events but also **all bass and broadband onset accents**, including backbeats between a too-slow grid's beats. Score and weights are engineering diagnostics, not confidence probabilities.
5. Compare viable candidate beat paths and return `provisional`, `ambiguous` or `undetermined`. Never return `supported` or `verified` because there is no independent validation.
6. Preserve the full capped beat-time sequence (at most 1024 events) for quantitative comparison against human reference beats; no decoded audio is persisted in the report.

This is a proof of **beat-grid reconstruction**, not yet a production-ready meter estimator. The two persistent synthetic misses illustrate the remaining difficulty choosing the actual pulse level in sparse rhythms.

## Reproducible development test

```bash
npm run validate
npm run benchmark:v4:development
npm run benchmark:v4:synthetic
```

Matched deterministic development stimuli: 4 nominal BPMs × 3 rhythmic patterns = 12. (Generated signals are neither independent musical ground truth nor full tracks.)

| Model | Proposals on 12 | Correct within ±1 BPM | Interpretation |
|---|---:|---:|---|
| V1 | 12 | 6 | Original ACF |
| V2 | 12 | 10 | Existing onsets and harmonic selection |
| V3 | 12 | 10 | Updated indicative review decision |
| Research V4 beat-grid | 12 | 10 | Beat paths constructed; **no accuracy gain over V2/V3** |

Additional generated no-beat signal: V4 must abstain without suggesting any BPM. In the earlier, fully frozen ablation V4 yielded **0/12 proposals** because many mathematically regular half/double and 3:2 grids competed. Adding broadband/bass phase evidence and sparse-onset handling increased results but did **not** eliminate incorrect half-tempo classifications. Do not omit this failed experiment.

Do **not** tune further on these twelve signals or the previously used WaivOps loops and then treat them as an independent holdout.

## Legal, independent real-audio evidence — current status

### WaivOps EDM-TECH — measured negative V4 result
31 CC BY 4.0 producer-labelled four-bar techno loop examples (repeated to meet the older detector's minimum duration). `npm run benchmark:licensed-techno -- --v3 --v4` compares all four engines on the same PCM and logs V4 separately. The CI #240 pilot on commit `284a67d2198c977251ef57a895b4134d13364861` produced:

| Engine | Proposed BPM | Within ±1 BPM of publisher labels | Precision conditional on proposal | Half/double errors |
|---|---:|---:|---:|---:|
| V1 | 31/31 | 19/31 | 61.29% | 12 |
| V2 | 31/31 | 31/31 | 100% | 0 |
| V3 | 31/31 | 31/31 | 100% | 0 |
| **Research V4** | **20/31** | **11/31** | **55.00%** | **3** |

**Decision: DO NOT PROMOTE V4.** The beat-grid DP in this version does not improve tempo inference. Strong periodicity and coherent event paths remain susceptible to metrical half/double errors, and the score sometimes selects a slower or slightly inaccurate pulse despite correct V2. Examples: `waivops_15` publisher 136/V2 136.25/V4 68.04 and `waivops_27` publisher 142/V2 142.01/V4 71. These are **real produced audio**, yet still repeated short loops with author labels, **not independently checked complete recordings**. Reported publisher-label accuracy must not be called musical ground truth.

This failure is an explicit **release blocker** for V4, not an invitation to tune parameters repeatedly on the same 31 already-seen examples. Archive this experiment as a failed candidate and use new independent data before developing a new beatgrid selection strategy.

### GiantSteps Tempo
[GiantSteps Tempo annotations](https://github.com/GiantSteps/giantsteps-tempo-dataset) describe 664 electronic music previews and include alternate tempo annotations. The audio copyright/access position is **not established by annotation availability**. The currently published mirdata loader says audio is not available for automated download. No Beatport audio was fetched or committed. Annotation format alone is insufficient for audio DSP testing.

### ARTBeaT
[AudioLabs ARTBeaT](https://www.audiolabs-erlangen.com/resources/MIR/2024-ARTBeaT) lists 25 short examples of meter changes, polyrhythms and ambiguous beats, with CC BY 4.0 dataset attribution. This could test beat timestamp F-measure after verifying how to obtain the actual human beat annotations and mapping their identifiers. **It is not a set of complete commercial hardgroove recordings.** Nothing has been silently counted as a verified benchmark.

### Independent MIR baselines and license boundaries
- [librosa `beat_track`](https://librosa.org/doc/main/api/generated/librosa.beat.beat_track.html) provides a documented three-stage onset, tempo and dynamic-programming beat detector. The project is ISC-licensed; Python implementation not silently shipped into this JS app.
- [Essentia RhythmExtractor2013](https://essentia.upf.edu/reference/std_RhythmExtractor2013.html) supports `multifeature` and `degara` beat tracking with beat timestamps and BPM. It requires 44.1 kHz; Essentia library is AGPLv3 or commercially licensed. **No Essentia code/model was embedded or installed in Grooveprint.** Consult licensing before distribution.
- Offline pinned `librosa==0.11.0` baseline was subsequently executed against the **same 31 licensed WaivOps repeated four-bar loops**, decoded locally at 12 kHz, using `librosa.beat.beat_track` defaults. The pilot recorded **31 proposals and 4/31 correct within ±1 BPM of publisher labels (12.90%)**, with no decoder errors. This is a constrained default-parameter research comparator, **not** evidence that librosa is intrinsically less accurate on real complete tracks. Some results are quantized to 140.625 BPM because of the chosen analysis configuration and short repeated input. Do not tune its parameters on these already-used loops and call the resulting score held-out accuracy.
- No same-PCM, **independently human-annotated** full-song comparison against either MIR library has been measured. This acceptance criterion is **NOT MET**.

## Independent evaluation tools and privacy
- `src/bpm-beatgrid-metrics.mjs` implements one-to-one matched beat-timestamp F-measure (default tolerance 70 ms). A half- or double-time beat sequence does not get a perfect score through duplicate matches. Test cases include phase errors, octave grids, missing beats, jitter and empty signal.
- `src/bpm-corpus-policy.mjs` rejects missing human beat annotations, publisher-only scalar BPM, undeclared audio rights, missing SHA-256, and duplicate recording families/files leaking into a different split. Declared rights and annotations still need human verification.
- `scripts/bpm-v4-verified-eval.mjs` uses only a private local manifest and SHA-256-checked audio, then decodes with locally installed FFmpeg into private memory, evaluates V1/V2/V3/V4 on the same PCM, and computes beat F-measure. It never uploads raw audio.
- A generated-waveform **engineering E2E test** exercises the real local decoder and SHA mismatch rejection. It is skipped when FFmpeg is absent; the CI test job now explicitly installs FFmpeg so this test must execute. This test proves the evaluation pipeline operates, **not** that any real song has independently verified tempo.
- Scalar BPM accuracy applies only to tracks with scalar references. Real tempo-changing pieces can still be evaluated by timestamp F-measure without inventing a single ground-truth BPM.

Example PRIVATE manifest schema (put real paths, hashes, rights and annotations in `.private/tempo-dataset/verified-beatgrids.json`, **never commit it**):

```json
{
  "tracks": [
    {
      "id": "opaque_track_001",
      "file": "audio/owned-track.wav",
      "split": "development",
      "recordingGroup": "same-master-family-001",
      "sha256": "<actual 64-character hex SHA-256>",
      "rightToAnalyze": true,
      "rightsEvidence": "owned master or specific written research permission",
      "verificationMethod": "independent-daw-beatgrid",
      "referenceProvenance": "independent human beat-grid check blinded to algorithms",
      "referenceBeatTimesSeconds": [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
      "groundTruthBpm": 120
    }
  ]
}
```

```bash
npm run benchmark:v4:verified
# For a frozen holdout: require explicit access approval in the CLI:
node scripts/bpm-v4-verified-eval.mjs --split holdout --allow-holdout
```

**Caution:** the example is a schema illustration, NOT a tested real recording or evidence of accuracy. The V4 benchmark currently analyses up to 180 seconds per file, not every minute of an entire long song.

## Remaining release blockers
1. Create and verify a real annotated corpus of version-exact full techno/hardgroove recordings, with lawful local audio and independent beat timestamps. Pre-register development/validation/holdout splits by recording family.
2. Run licensed offline Essentia/librosa reference baselines on *the same PCM* (never assume their reported confidence is calibrated).
3. Separate true beat-level performance from scalar tempo and half/double/3:2 error rates. Include confidence intervals and reporting by style and duration.
4. Revisit candidate generation beyond V1/V2, segmentation and variable-tempo detection only when independent data supports an experiment.
5. Require evidence of a statistically meaningful precision/coverage improvement over V2/V3. An experiment that ties V3 on synthetic data is **not sufficient** to replace the product detector.
6. Verify full browser lifecycle, privacy, rights and CPU/memory budgets *after* musical validation and before product integration.

**Release state: NOT READY.** V4 is a tested research addition, not a confirmed BPM detection solution. The final commit's CI must be checked independently. No publication on `main` or Railway.
