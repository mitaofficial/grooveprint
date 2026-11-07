# GROOVEPRINT 3.0 — Musical BPM validation protocol

**Status: EXPERIMENTAL.** A green CI and synthetic audio are not proof of musical accuracy.

## Code audit: observed design limitations

Reviewed: `src/bpm-tempo.mjs`, `src/bpm-library.js`, `src/auto-bpm.js` and existing test suite.

1. **Integer-lag resolution:** approximately 100 onset frames/second, with `tempo = 60 * Hz / integerLag`. At exactly 100 Hz, a 138 BPM period falls between lag 43 (139.53 BPM) and 44 (136.36 BPM). No sub-lag interpolation exists. Accuracy within ±1 BPM is not assured even on perfect beat trains.
2. **Only the beginning of the track:** up to the first 180 seconds are evaluated; there is no multi-window consensus to protect against intro, breakdown or changes in tempo.
3. **Stereo cancellation:** channels are summed sample-by-sample before the onset novelty is measured, allowing anti-phase transients to cancel.
4. **Percussion prominence:** one combined energy/derivative onset envelope can favor hi-hats, ghost notes and subdivisions rather than tactus.
5. **Metrical ambiguity:** the strongest normalized autocorrelation score wins, not necessarily the musically intended tempo. Half-time/double-time candidates are only sometimes flagged.
6. **No calibrated probability:** `confidence: null` is appropriate until an independent reference benchmark is available.
7. **Weak existing oracle:** prior synthetic unit tests only required the known BPM to appear *somewhere* among the candidates, not as the primary answer.
8. **Batch performance unknown:** full-browser decoding per file, sequential processing up to 1,500 files, limited codec support and no browser memory/throughput benchmark.
9. **Catalog limitations:** AcousticBrainz estimates require an exact recording MBID and are not verified reference BPMs.

These are code-derived risks, **not measured error rates on real recordings**.

## Run the reproducible baseline

Requires Node.js >=22.13.

- `npm test` runs unit tests including a quick benchmark smoke test.
- `npm run benchmark:quick` runs nine synthetic rhythm tests plus one nonrhythmic case.
- `npm run benchmark:synthetic` runs the full deterministic cross-tempo suite.

Generated reports are written beneath `.private/benchmarks/synthetic/`: `summary.json`, `results.csv`, `report.md`. They contain aggregate metrics, anonymized test IDs and results, never audio bytes. Do not commit local reports.

## Independently verified real recordings

Create `.private/tempo-dataset/manifest.json` and store authorized audio locally under `.private/tempo-dataset/audio/`. Sample manifest:

```json
{
  "tracks": [
    {
      "id": "recording_001",
      "file": "audio/001.wav",
      "category": "techno-hardgroove",
      "groundTruthBpm": 138,
      "groundTruthStatus": "verified",
      "verificationMethod": "independent DAW beat-grid over three sections"
    }
  ]
}
```

Use anonymous IDs rather than artist/title/file metadata. Ground-truth tempo must be checked independently, ideally with a DAW grid across several sections, and independently rechecked for ambiguous cases. Valid statuses are `verified`, `variable`, `ambiguous` and `unavailable`. Only `verified` cases enter the numerical accuracy denominator. Do not use provider BPM values alone as verified ground truth.

Run with WAV PCM (16/24/32-bit integer or float32):

```bash
node scripts/bpm-benchmark.mjs --real --manifest .private/tempo-dataset/manifest.json --out .private/benchmarks/real
```

For compressed music, install FFmpeg locally and use `--decoder ffmpeg` (or `npm run benchmark:real`). It decodes locally to 12 kHz stereo float32 for a maximum of 180 seconds, **without uploading audio**. FFmpeg resampling can differ from native Web Audio browser decoding; cross-validation on Chromium is a separate required gate.

Decoded failures are reported as `decode-error` and count toward total file coverage. The `.private/` directory is excluded from Git. Never commit unauthorized recordings.

## Comparison and scoring

Do not alter the baseline before recording it. To compare an experimental local implementation that exports `estimateLocalTempo()`:

```bash
node scripts/bpm-benchmark.mjs --synthetic --compare src/bpm-tempo-experiment.mjs --out .private/benchmarks/compare
```

Use identical inputs and separate development/held-out evaluation sets. `top1Within1Pct` scores the primary suggestion; `candidateWithin1Pct` only checks for a correct **alternative** anywhere in the candidate list. `acceptedWithin1Pct` only scores predictions that would be accepted without review, so pair it with `acceptedN` and `autoAcceptedPct`. Error summaries also report octave mistakes, unflagged octave mistakes, MAE, median error, coverage and mean analysis time. The real dataset must be marked **NOT TESTED** until authorized real recordings are actually analyzed.

## Recommended validation program

Aim for at least 120 real recordings representing techno/hardgroove, tribal, old-school vinyl transfers, house, breaks, drum & bass, and irregular/nonrhythmic material. Cover compressed masters, noise, swing, intros, tempo drift, remixes, alternate versions and half/double-time. Use a held-out evaluation split to avoid tuning and scoring on the same music.

Provisional gates for a **future** beta or production decision (not results): >=95% accepted ±1 BPM on stable 4/4, <2% unflagged half/double-time mistakes, >=90% accepted ±2 BPM on complex rhythms with transparent coverage; never overwrite confirmed manual BPMs. Calibrated confidence or a 98% precision auto-accept policy must be empirically justified.

Current release classification: **EXPERIMENTAL**. Remaining blockers include real-audio ground truth, full native-browser codec checks, 100/500/1500-file stress tests, calibration, and controlled comparison with alternative DSP. Synthetic CI is not a production sign-off. No merge or Railway deployment is authorized by this benchmark.
