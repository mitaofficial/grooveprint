# Architecture — implemented scope

```text
Discogs/CSV tracklist
  → exact artist + version metadata (if available)
  → verified MusicBrainz Recording MBID (optional user-provided)
     → POST /api/bpm/open/batch → server/bpm-open.mjs → AcousticBrainz CC0
  → GetSongBPM (only when configured)
  → track.bpm / bpmStatus / source / reference
  → label preview and PDF

CONNECT AUDIO LIBRARY (one folder in current browser tab)
  → strict file basename matching, no fuzzy silent assignment
  → browser Web Audio decode → src/bpm-tempo.mjs
  → estimate or REVIEW if half/double ambiguity
  → track.bpm and candidates → label design/PDF
```

Server: Node 22, CSRF-protected batch; no Acoustic credentials or client-side secrets. Explicit MBID-only archive lookup. Limit eight per HTTP request; global and per-session rate protection. Browser: 1 folder selection, one-by-one decode to bound simultaneous memory, up to 1500 candidate files <=160 MiB each. No audio uploading. User-created BPM and manually supplied MBIDs are stored locally in a separate evidence map keyed by a nonplaintext release/position/artist-title hash. This excludes collection membership, folder identifiers and raw Discogs metadata; matching is conservative and user-generated records survive source expiry.

**Not implemented:** licensed auto-MBID resolution by title, background persisted queue, a multi-algorithm DSP ensemble, calibrated confidence, large-scale dataset index, browser-closed execution, paid plans. Absence of those features must not be hidden.
