# DSP benchmark — preliminary

New original experimental detector: `src/bpm-tempo.mjs`. The method uses a per-frame onset-energy envelope and normalized lag autocorrelation. It generates candidates and exposes possible half/double ambiguities, while confidence remains null (not calibrated).

Unit tests in `tests/bpm-tempo.test.mjs` generate copyright-free synthetic rhythmic pulses at 100, 124, 138, 160 BPM and check that at least one returned tempo candidate lies within ±3 BPM. There is also a silence and a short-clip test. These synthetic cases are **not real music** and **do not establish field accuracy**.

Browser E2E generated a local 138 BPM PCM WAV (not downloaded from any service), decoded it in Chromium, associated it to the correct track and returned a tempo candidate with no remote audio upload.

NO BENCHMARK EXISTS YET for real vinyl transfers, syncopated tribal/hardgroove, broken beat, remixes or recording noise. No claim of 98% accuracy. Next: 50+ authorized real tracks, then >300 with BPM reference, compare with permissively licensed alternative and report ±1/±2 BPM and octave errors.
