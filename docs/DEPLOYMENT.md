# Development and deployment boundaries

Development branch: `feature/bpm-intelligence-3-open-data`, draft PR #3.
Main and Railway stay unchanged in this task. No merge, auto-merge, deployment or
secret modification is authorized by successful tests.

The server retains its existing Node 22+, Dockerfile, SQLite volume, `/health`,
PUBLIC_ORIGIN and session encryption configuration. Discogs OAuth still uses
DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET. Audio analysis itself runs in
the browser and does not need any external BPM API credential.

The retired catalog key is not read by the application. An obsolete environment
entry has no effect; no production environment was inspected or edited to remove it.
Do not add it to configuration examples or provision a replacement provider.

Future deployment verification, only when separately authorized: health, Discogs
session/CSRF behavior, the `collection-enrichment.js` metadata asset, the local
worker/detector assets, CSV-to-audio workflow and PDF output. The capability route
`/api/bpm/status` reports local-audio requirements. Former catalog lookup/batch
routes return 410; the frontend does not call them. `/credits` describes the
internal engine and retained catalog attribution rather than a BPM service signup.
