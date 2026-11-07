# GROOVEPRINT architecture

Current development architecture after catalog-provider removal, 2026-11-07.
Historical designs are retained in Git history and explicitly marked reports.

| Module | Responsibility |
|---|---|
| `index.html` | Collection state, Discogs metadata lifecycle, explicit BPM edits, editor and progressive vector PDF |
| `src/collection-enrichment.js` | Owned metadata/tracklist recovery only; cancellation and restart epochs; never calculates or looks up tempo |
| `src/bpm-library.js` | Shared library/single-track queue, authorized file association, exact library matching, stop and PCM/worker ownership; development-only opt-in comparison |
| `src/bpm-worker.mjs` | Browser module worker using the unchanged original `src/bpm-tempo.mjs` baseline |
| `src/bpm-engine.mjs` | Common bounded PCM validation and result contract; unchanged baseline detector |
| `src/bpm-worker-dev.mjs` | Development/local-file comparison of V1/V2 on independent PCM; diagnostic results require user selection |
| `src/bpm-evidence.js` | Write tickets and revision barriers protecting human choices and stale results |
| `src/bpm-tempo-experiment.mjs` | Benchmark challenger available only to opt-in development/local-file comparison; denied by production server |
| `server/app.mjs` | Discogs OAuth/metadata, static assets, sessions, capability status and explicitly requested archive research adapter |
| `scripts/tempo-evaluation.mjs` | Shared denominators, detector isolation, per-case failures and honest metrics |
| `scripts/dev.mjs` | Local-only full-server launcher with random in-memory key/session database; production start unchanged |
| `scripts/build-local-preview.mjs` | Bundles the real app and workers into standalone HTML for a downloadable local trial |
| `examples/grooveprint-demo.csv` | Downloadable fictional metadata fixture, no real release IDs or invented tempo assignments |

The default workflow has no external BPM lookup or provider-configuration step.
Import/sync recovers metadata; missing tempo remains missing until authorized
signal analysis or explicit manual input. The local engine needs no Discogs login
or third-party BPM key. No audio, PCM or waveform is uploaded to the backend.

Node.js >=22.13, SQLite and Railway configuration are retained for the existing
backend. This development change does not deploy, edit secrets or update main.
The archive adapter remains isolated behind an explicitly requested endpoint;
it is not automatically invoked for stored MBIDs or used as engine fallback.
