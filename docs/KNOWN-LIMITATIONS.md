# Known limits and remaining work

1. GetSongBPM API key is not configured in Railway; no real catalog BPM can currently be fetched, though the client/server lookup pipeline is coded and mocked in tests.
2. Automatic lookup runs in the current browser tab, not a durable server-side queue. Closing the tab stops work.
3. No legally authorized provider supplying raw track PCM automatically has been integrated. Discogs offers metadata, not the audio. Automatic audio DSP per track is therefore not achieved.
4. Essentia.js not shipped pending commercial license review and audio benchmarks.
5. CSV-only users without Discogs OAuth do not have access to the protected GetSongBPM batch endpoint.
6. Exact matching may miss spelling variations; it deliberately favors no BPM over incorrect BPM.
7. Heavy imports require real browser endurance tests. Discogs rate limiting may prolong tracklist fetches.
8. Live OAuth, provider response, PDF physical print and YouTube embeds require browser/service validation with permitted credentials and media.
9. Repository currently public; protect source/rights as appropriate before commercialization.

Future milestones: secure persisted job queue; licensed audio preview and optional one-time user audio library; calibrated DSP benchmarks; subscription readiness and print QA.
