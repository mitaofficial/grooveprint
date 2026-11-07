# GROOVEPRINT
Vinyl workstation with Discogs OAuth backend.

Deploy to Railway with a persistent volume at `/data`. Configure `NODE_ENV=production`, `PUBLIC_ORIGIN=https://grooveprint-web-production.up.railway.app`, `SQLITE_PATH=/data/sessions.db`, `SESSION_ENCRYPTION_KEY` (64 random hex digits), `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET` and `DISCOGS_USER_AGENT` in Railway variables. Never commit secrets.

Discogs OAuth callback: `https://grooveprint-web-production.up.railway.app/api/discogs/callback`.

Health: `/health`. Discogs API status: `/api/discogs/status`.

This is alpha software. Test a single collection folder before broader use. API use and commercialization are subject to Discogs terms.

## BPM Intelligence 3.0 alpha / source revalidation

This is a work-in-progress feature on PR #3, not a production-approved BPM accuracy claim. `npm test` runs Node unit tests; `npm run test:syntax` checks syntax; `node tests/browser-smoke.mjs` exercises the full Chromium flow after installing Playwright and Chromium (the CI workflow does this automatically).

OAuth-backed Discogs collection membership and Discogs-sourced tracklists are **temporary**. They expire after 15 minutes, are removed from the active view, and are not saved to a persistent project snapshot. Revalidation is attempted only while connected, with at most one pending timer, no concurrent Discogs/auto-BPM job, an initial minimum 60-second request interval, exponential backoff for failures (60/120/240 seconds) and at most three automatic failed attempts per expiry. After repeated errors, use **RISINCRONIZZA DISCOGS** manually. Authentication errors and HTTP 429 stop automatic retries; check the session or rate limit first.

User-entered/confirmed BPMs are stored separately in browser-local evidence keyed by Discogs release ID, position, artist, and track title. They can be restored when the *same* track is fetched again, without persisting the private Discogs collection. A different track/version must not inherit a prior manual value. Local evidence may be lost if the user clears browser storage; export user-owned projects separately as appropriate.

The AcousticBrainz open-data adapter needs an exact recording MBID and covers only archived recordings. The optional on-device DSP produces estimates, **not verified BPMs**, and some audio codecs/tempo subdivisions can be ambiguous. Do not describe a successful provider probe as proof that a usable BPM was obtained. No audio data is sent to GROOVEPRINT by the local analyzer.

## Musical BPM benchmarking (experimental)

See [DSP audit and musical validation protocol](docs/bpm-musical-validation.md) and the [local ground-truth manifest example](docs/tempo-manifest.example.json).

- `npm run benchmark:synthetic`: deterministic synthetic baseline; outputs summary, anonymized CSV and Markdown in `.private/benchmarks/synthetic/`.
- `npm run benchmark:compare`: compare baseline and experimental multiband/200 Hz detector on identical synthetic inputs. This does not enable the experiment in production.
- `npm run benchmark:real`: independently verified local files using FFmpeg (install separately).
- `npm run benchmark:browser`: real browser decoder path via locally installed Playwright/Chromium; no audio uploaded.
- `npm test`: regression tests including a short tempo benchmark.

**Synthetic performance is not a claim about real music.** Do not merge or deploy the experimental detector until sufficient independently verified real recordings meet the agreed evaluation criteria.

### First licensed techno audio pilot

The independent CI job `licensed_audio_pilot` evaluates 12 WaivOps / Patchbanks EDM-TECH CC BY 4.0 examples. The clips are four-bar producer-labeled samples repeated to satisfy the detector's minimum duration. These are **source-label agreement checks**, not independent full-song tempo verification. The audio is never committed or uploaded as an artifact.

See [licensed dataset, results and licensing assessment](docs/bpm-open-audio-rights-audit-2026-11-07.md). Run locally with `npm run benchmark:licensed-techno` (Node 22, FFmpeg, internet). The experimental DSP is not enabled in GROOVEPRINT production.
