> Historical record: the catalog-provider design below was superseded on 2026-11-07. GetSongBPM is removed from active integration. Follow ARCHITECTURE.md, BPM-INTELLIGENCE.md and WORK-CHECKPOINT.md for the current product. Old key/backlink instructions are not active setup steps.

# GROOVEPRINT 3.0 — BPM research (2026-11-06)

## Verified public evidence

- AcousticBrainz public CC0 archive and API, discontinued new submissions in 2022: https://acousticbrainz.org/ ; API specification: https://acousticbrainz.readthedocs.io/api.html .
- One LIVE public request from GitHub Actions to `/api/v1/6df2d3b5-25e1-4d4c-a196-0404990a93ec/low-level` returned HTTP 200, JSON and `rhythm.bpm = 117.291557312`. The source recording page reports ~117 BPM: https://acousticbrainz.org/6df2d3b5-25e1-4d4c-a196-0404990a93ec . That is a historical provider result, not Grooveprint DSP.
- MusicBrainz core data is CC0, but the **free public API is for non-commercial use**; other terms and 1 req/sec per IP apply: https://musicbrainz.org/doc/MusicBrainz_API and https://musicbrainz.org/doc/About/Data_License . Hence MusicBrainz title-search is NOT enabled in production.
- GetSongBPM offers a documented key-based API but its registration is unconfirmed and Railway lacks `GETSONGBPM_API_KEY`. Backlink is already present. It remains optional.
- SonoVault public terms at https://sonovault.now/terms restrict redistributing provider data or building a derived music database; section 25 contains substantial contractual penalties. Do not integrate without specific permission/licensing analysis.
- web-audio-beat-detector (MIT) is a possible alternative reference: https://www.npmjs.com/package/web-audio-beat-detector . librosa (ISC) is another reference, but deploying Python just for DSP would increase hosting costs: https://github.com/librosa/librosa/blob/main/LICENSE.md .

## Current implementation decision

Ship only the CC0 archive adapter behind exact MBID lookup, plus an original **experimental** browser-side local audio estimator. No ripping, no streaming extraction, no forged key. No provider credentials needed for AcousticBrainz. Do not claim coverage for music with no recording MBID. Benchmark on real hardgroove remains uncompleted.
