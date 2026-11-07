# Internal BPM architecture

The primary path is GROOVEPRINT BPM Engine (experimental), using authorized local
signal. Discogs supplies track metadata, not an implied tempo or audio file.

1. Import CSV or synchronize collection metadata.
2. Recover missing tracklists if requested.
3. User connects authorized audio; exact artist/title/version matching abstains on ambiguity.
4. One context decodes sequentially; copied bounded PCM is transferred to one reusable worker.
5. The unchanged original detector returns an estimate or review candidates.
6. Evidence tickets discard results for changed tracks, collections, user revisions or cancelled jobs.
7. Choosing a local candidate remains `estimated`; explicit user confirmation creates `verified`.
8. The editor and PDF preserve that distinction and existing historical external evidence.

No title/artist catalog API participates in this path. `/api/bpm/status` describes
local capabilities, never a key-configured provider. Former catalog endpoints
return `410 BPM_CATALOG_RETIRED`; no browser caller remains.
The archive research adapter is explicit and isolated. It is not a fallback.

The challenger stays in `src/bpm-tempo-experiment.mjs` for measured development.
Neither provider removal nor a green CI promotes it into the UI. See
`BPM-PRODUCTION-STATUS.md` for the independent musical-validation gate.
