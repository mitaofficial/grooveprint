# GROOVEPRINT: local real-audio validation with Ableton Live

**Do this on your own computer. No audio is uploaded to GROOVEPRINT, GitHub or Railway.**

## Stage 1 — Select original, authorized recordings

Start with 30 complete tracks for a pilot. Include 8 regular techno/hardgroove; 5 tribal/percussive; 5 old-school vinyl transfers; 4 house; 4 electro/breaks; 2 other tempo ranges; and 2 irregular/no-beat controls, if available.

Avoid selecting only 138 BPM or only clean four-on-the-floor music. Keep different versions of the same recording out of different evaluation sets. Do not copy a protected audio file to the Git repository. Only use audio you are authorized to analyze.

On Windows, create a folder inside your private local checkout:

```text
GROOVEPRINT/
  .private/
    tempo-dataset/
      audio/
        track-01.wav
        track-02.mp3
        ...
```

The `.private` directory is ignored by Git.

Run:

```powershell
npm run benchmark:init-local
```

This writes a local `.private/tempo-dataset/manifest.json` with anonymous IDs and all values marked `groundTruthStatus: "unavailable"`. **This is intentional:** filenames and database BPMs are not verified tempo measurements. Do not re-run the initializer on an edited manifest; it refuses to overwrite your work unless you explicitly pass `--force`.

## Stage 2 — Independently verify BPM in Ableton Live 12

For each stable-tempo recording:

1. Open the original file in Ableton Live. Make an independent judgment of the rhythm: do not simply copy a database entry or rely on auto-warp.
2. In a stable drum section, place a beat-grid reference on a clear downbeat.
3. Adjust the project tempo until the waveform accents remain aligned over **at least 16 and 32 beats**.
4. Verify a second rhythmic section much later in the track, checking for drift over the grid.
5. If you find that 70 and 140 both align mathematically, record the intended musical pulse (tactus) and note the alternate metric level; do not silently assume the genre tempo.
6. For vinyl rips, note any pitch/speed changes, wow/flutter and mono/stereo transfer differences. BPM measured on the file at its actual playback speed may differ from the disc's original value.
7. If the beat grid fails across sections, record `groundTruthStatus: "variable"` or `"ambiguous"`. Do not force a single BPM value.

Once measured and reviewed, edit the matching entry in `manifest.json`:

```json
{
  "id": "recording_0001",
  "file": "audio/track-01.wav",
  "category": "techno-hardgroove",
  "groundTruthBpm": 138,
  "groundTruthStatus": "verified",
  "verificationMethod": "Ableton Live 12; beat grid aligned over 32 beats in two separate sections",
  "split": "development",
  "notes": "stable 4/4; no pitch shift"
}
```

Never mark `verified` without actual independent beat-grid validation. When possible, have a second person double-check ambiguous recordings. Save the local manifest privately.

## Stage 3 — Run both local benchmarks

For WAV PCM:

```powershell
node scripts/bpm-benchmark.mjs --real --manifest .private/tempo-dataset/manifest.json --out .private/benchmarks/real
```

For compressed formats, install FFmpeg and run:

```powershell
npm run benchmark:real
```

Install local Playwright and Chromium (not bundled with GROOVEPRINT):

```powershell
npm install --no-save playwright@1.57.0
npx playwright install chromium
npm run benchmark:browser
```

The Node/FFmpeg and Chromium/WebAudio decoders may produce different sample-rate behavior. Compare them, rather than assuming they must match. Outputs live under `.private/benchmarks/`. Keep the audio in your local folder. Benchmark JSON/CSV has anonymous IDs, not personal record metadata.

## Stage 4 — Interpret outputs

The final decision must consider:

- Correctness of the first BPM versus the verified value (±1 or ±2).
- Whether the correct tempo is merely a lower-ranked candidate.
- Octave/half-time errors, and whether the user was warned.
- Accepted-only precision **together with** the percentage of tracks automatically accepted.
- Decode failure count, analysis speed and browser behavior.

At least 120 development recordings and a separate held-out evaluation set are preferable before making commercial accuracy promises. The initial 30 are a **pilot**, not final validation. Track versions and remixes must not leak into both sets.

### What we know today

As of 2026-11-07, GROOVEPRINT tested 12 real produced CC BY techno rhythm loops with publisher BPM labels. These were repeated for compatibility with the current detector and are **not the same thing as untouched full tracks with independent Ableton BPM measurements**.

The V2 pilot agreed with 10/12 of the producer labels ±1 BPM as its first choice, but did not automatically accept any of the 12 due to conservative ambiguity checks. This is why a pilot of longer, independently verified recordings is essential before changing the production DSP.

Do not merge PR #3 or deploy Railway based on producer labels alone.
