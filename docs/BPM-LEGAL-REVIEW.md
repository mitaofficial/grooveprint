> Historical record: the catalog-provider design below was superseded on 2026-11-07. GetSongBPM is removed from active integration. Follow ARCHITECTURE.md, BPM-INTELLIGENCE.md and WORK-CHECKPOINT.md for the current product. Old key/backlink instructions are not active setup steps.

# Legal & licensing review (engineering, not legal advice)

- **AcousticBrainz:** published database is CC0. It is suitable as a historical BPM source, provided that the exact MusicBrainz recording ID is reliable and results are clearly marked as old algorithmic estimates.
- **MusicBrainz:** CC0 **core data** does not mean unlimited free use of the hosted web API in a commercial SaaS. Official API states non-commercial use is free; commercial uses require appropriate arrangements. Therefore no automatic public MusicBrainz lookup is enabled here.
- **SonoVault:** Terms last updated July 13, 2026, particularly §§3–4, 6–7, 25, constrain redistributing even small amounts, building derivative music catalogs and third-party access. Section 25 states a potential EUR 25,000 contractual penalty plus daily additions in specified cases. This service is not integrated.
- **GetSongBPM:** API key and backlink required; not accessed without credentials. The frontend homepage and `/credits` contain backlink.
- **Audio:** User selects locally owned or authorized music files. Analysis uses Browser Web Audio; no upload or extraction from YouTube/Spotify/Beatport.
- **DSP:** Original JS algorithm in `src/bpm-tempo.mjs`, no third-party audio DSP dependencies bundled. Future changes require a license inventory and real benchmark.

References: https://acousticbrainz.org/ , https://musicbrainz.org/doc/MusicBrainz_API , https://sonovault.now/terms , https://getsongbpm.com/api .
