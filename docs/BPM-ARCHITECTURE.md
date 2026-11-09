# Internal BPM architecture

Development now also has an automatic import path: metadata-ready hook →
bpm-auto.js → development-only approved audio-source resolver → browser download
→ the same bpm-library.js queue/worker → review candidates. Discovery is restricted to FMA items declaring CC0/CC BY, not a pinned release ID.
One album supplies the live control proof. See BPM-AUTOMATIC-IMPORT.md; this is not general
commercial catalog coverage or a production rollout.

The primary path is GROOVEPRINT BPM Engine (experimental), using authorized local
signal. Discogs supplies track metadata, not an implied tempo or audio file.

1. Import CSV or synchronize collection metadata.
2. Recover missing tracklists if requested.
3. User connects authorized audio; library artist/title/version matching abstains on ambiguity.
   A single-track FILE association explicitly identifies the recording and is checked
   against the record, track object and artist/version identity before analysis.
4. One context decodes sequentially; copied bounded PCM is transferred to one reusable worker.
5. The unchanged original detector returns an estimate or review candidates.
   The single-track button and library both use bpm-library.js and bpm-engine.mjs.
6. Evidence tickets discard results for changed tracks, collections, user revisions or cancelled jobs.
7. Choosing a local candidate remains `estimated`; explicit user confirmation creates `verified`.
8. The editor and PDF preserve that distinction and existing historical external evidence.

No title/artist catalog API participates in this path. `/api/bpm/status` describes
local capabilities, never a key-configured provider. Former catalog endpoints
return `410 BPM_CATALOG_RETIRED`; no browser caller remains.
The archive research adapter is explicit and isolated. It is not a fallback.

The focused mandate of 7 November authorizes an opt-in local comparison with
`src/bpm-tempo-experiment.mjs`: development-only bpm-worker-dev.mjs evaluates both
algorithms on separate PCM copies and retains diagnostic candidates. The previous
BPM stays intact until explicit selection; production denies both experimental
assets and V1 remains default. The standalone file bundles those same workers.
See `BPM-INTEGRATION.md` for the path map and `BPM-PRODUCTION-STATUS.md` for the
independent musical-validation gate, which remains incomplete.
