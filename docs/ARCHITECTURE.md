# GROOVEPRINT — architecture (v2 alpha)

Deployment: Node.js >=22, Railway, SQLite on persistent volume `/data` for OAuth session data. Frontend remains vanilla HTML/CSS/JS. An extra client-side script `src/auto-bpm.js` drives BPM lookup after import; `server/bpm-match.mjs` encapsulates strict matching and status resolution.

Path: Discogs OAuth -> collection page sync -> release tracklist retrieval -> batch BPM lookups -> track status -> label design/PDF.

**Important:** the current orchestrator runs in an open browser tab; it is not a background job service or persistent server queue. Closing the tab interrupts the scan. A durable per-user job queue with session-safe authorization and retention controls is a later architectural milestone.

External sources: Discogs API (catalog + restricted collection data), optional GetSongBPM API. No YouTube audio ripping. Local audio DSP is a separate experimental function and is not called automatically unless an authorized PCM source exists.

Do not delete the Railway /data volume, expose OAuth secrets, or loosen existing Discogs data retention without legal review.
