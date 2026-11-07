# GROOVEPRINT
Vinyl workstation with Discogs OAuth backend.

**Automatic Discogs BPM: partial research implementation.** `npm run dev` now
starts source resolution and shared DSP after tracklist import, without audio
file selection, searching the curated Free Music Archive collection for declared
CC0/CC BY recordings with exact metadata. A live control album was tested. All results
require review. General techno/hardgroove catalog access and automatic acceptance
remain unresolved; production does not enable this resolver. Read the
[live-source evidence and precise limits](docs/BPM-AUTOMATIC-IMPORT.md).
`npm run proof:auto-bpm` explicitly runs the real public-source/FFmpeg research
proof; it is separate from offline tests. The standalone HTML has no such backend.

For a downloadable local BPM trial, run `npm run preview:local`, then open
`.private/local-preview/GROOVEPRINT-BPM.html` on your PC. The generated file needs
no Node installation to open. It includes CSV/editor/audio/PDF and opt-in V1/V2
comparison; V1 remains default, OAuth needs the configured server. See
[BPM trial steps](docs/BPM-LOCAL-TRIAL.md) and [integration evidence](docs/BPM-INTEGRATION.md).
The public Railway page still serves the old main HTML; this branch is not deployed.

For a local product trial with Node >=22.13, run `npm run dev` and open the
printed Local URL. No external BPM key or account is needed. Development uses
an ephemeral encryption key and in-memory backend sessions; browser projects
remain local and can be exported as JSON. The launcher never opens a configured
database and refuses NODE_ENV=production. Production still uses `npm start` with
the existing explicit configuration below.

Use IMPORT → DOWNLOAD EXAMPLE CSV for five fictional releases / 12 tracks and
no real release IDs or BPM. See [the ten-step trial](docs/USER-TEST-GUIDE.md) and
[product audit / prioritized next work](docs/PRODUCT-AUDIT.md). The standalone file
provides the local trial when the ChatGPT remote-browser connection is unavailable.

Deploy to Railway with a persistent volume at `/data`. Configure `NODE_ENV=production`, `PUBLIC_ORIGIN=https://grooveprint-web-production.up.railway.app`, `SQLITE_PATH=/data/sessions.db`, `SESSION_ENCRYPTION_KEY` (64 random hex digits), `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET` and `DISCOGS_USER_AGENT` in Railway variables. Never commit secrets.

Discogs OAuth callback: `https://grooveprint-web-production.up.railway.app/api/discogs/callback`.

Health: `/health`. Discogs API status: `/api/discogs/status`.

This is alpha software. Test a single collection folder before broader use. API use and commercialization are subject to Discogs terms.

## BPM Intelligence 3.0 alpha / source revalidation

This is a work-in-progress feature on PR #3, not a production-approved BPM accuracy claim. `npm test` runs Node unit tests; `npm run test:syntax` checks syntax; `node tests/browser-smoke.mjs` exercises the full Chromium flow after installing Playwright and Chromium (the CI workflow does this automatically).

OAuth-backed Discogs collection membership and Discogs-sourced tracklists are **temporary**. They expire after 15 minutes, are removed from the active view, and are not saved to a persistent project snapshot. Revalidation is attempted only while connected, with at most one pending timer, no concurrent Discogs/metadata-recovery job, an initial minimum 60-second request interval, exponential backoff for failures (60/120/240 seconds) and at most three automatic failed attempts per expiry. After repeated errors, use **RISINCRONIZZA DISCOGS** manually. Authentication errors and HTTP 429 stop automatic retries; check the session or rate limit first.

User-entered/confirmed BPMs are stored separately in browser-local evidence keyed by Discogs release ID, position, artist, and track title. They can be restored when the *same* track is fetched again, without persisting the private Discogs collection. A different track/version must not inherit a prior manual value. Local evidence may be lost if the user clears browser storage; export user-owned projects separately as appropriate.

The internal on-device DSP produces estimates, **not verified BPMs**, and some audio codecs/tempo subdivisions can be ambiguous. No audio data is sent to GROOVEPRINT by the local analyzer. The isolated AcousticBrainz research adapter needs an exact recording MBID and covers only archived recordings; it is not called by the default UI. A successful archive availability probe does not prove that a usable BPM was obtained.

## Musical BPM benchmarking (experimental)

See [DSP audit and musical validation protocol](docs/bpm-musical-validation.md) and the [local ground-truth manifest example](docs/tempo-manifest.example.json).

- `npm run benchmark:synthetic`: deterministic synthetic baseline; outputs summary, anonymized CSV and Markdown in `.private/benchmarks/synthetic/`.
- `npm run benchmark:compare`: compare baseline and experimental multiband/200 Hz detector on identical synthetic inputs. This does not enable the experiment in production.
- `npm run benchmark:real`: independently verified local files using FFmpeg (install separately).
- `npm run benchmark:browser`: real browser decoder path via locally installed Playwright/Chromium; no audio uploaded.
- `npm test`: regression tests including a short tempo benchmark.

**Synthetic performance is not a claim about real music.** Do not merge or deploy the experimental detector until sufficient independently verified real recordings meet the agreed evaluation criteria.

### First licensed techno audio pilot

The independent CI job `licensed_audio_pilot` evaluates 31 WaivOps / Patchbanks EDM-TECH CC BY 4.0 public examples. The clips are four-bar producer-labeled samples repeated to satisfy the detector's minimum duration. These are **source-label agreement checks**, not independent full-song tempo verification. The audio is never committed or uploaded as an artifact.

See [licensed dataset, results and licensing assessment](docs/bpm-open-audio-rights-audit-2026-11-07.md). Run locally with `npm run benchmark:licensed-techno` (Node 22, FFmpeg, internet). The experimental DSP is not enabled in GROOVEPRINT production.

For the next independent full-track pilot, see [Ableton Live 12 BPM reference workflow](docs/ableton-tempo-validation-guide.md). Start with `npm run benchmark:init-local`: it creates a private manifest with every BPM explicitly unverified. Only set `groundTruthStatus: "verified"` after checking the beat grid in a DAW.

## Development stability gate

Before pushing to the feature branch run `npm run validate` (offline: tracked-file privacy, configuration, Node unit/syntax tests and short synthetic BPM benchmark). CI cancels superseded PR runs but retains checks on `main`. For recorded limitations and remaining performance tests see [Operation Stability audit](docs/operation-stability-audit-2026-11-07.md).


## Internal BPM analysis

GROOVEPRINT BPM Engine is experimental, processes authorized local audio in a browser worker and needs no external BPM API key. CSV/Discogs tracklists alone leave missing BPMs empty. Connect local audio, inspect candidates and confirm explicitly. Historical imported values keep their source; metadata recovery and the optional archive research adapter are separate from local signal analysis. See docs/WORK-CHECKPOINT.md.
