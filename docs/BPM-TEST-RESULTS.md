> Historical record: the catalog-provider design below was superseded on 2026-11-07. GetSongBPM is removed from active integration. Follow ARCHITECTURE.md, BPM-INTELLIGENCE.md and WORK-CHECKPOINT.md for the current product. Old key/backlink instructions are not active setup steps.

# Validation evidence

- `npm test`: unit tests including AcousticBrainz parser, API errors, local DSP synthetic signals, exact file version matching, preservation of manual BPMs.
- `npm run test:syntax`: backend and matching parser checks.
- GitHub Actions Chromium E2E: Discogs mock import -> tracklist -> BPM catalog; expired Discogs data auto-resync; locally generated WAV -> one-folder audio analysis -> candidate tempo with no extra BPM-provider HTTP calls.
- Public AcousticBrainz live read-only GET: MBID `6df2d3b5-25e1-4d4c-a196-0404990a93ec`, HTTP 200, rhythm.bpm 117.291557312.

Evidence is in branch workflow logs; mocks are not live provider validation. No GetSongBPM API key, no real Discogs OAuth account integration test, no real music/vinyl DSP benchmark, no physically measured label print test. Treat every such criterion as NOT VERIFIED.
