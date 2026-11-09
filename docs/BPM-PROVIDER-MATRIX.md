# BPM inputs and active capabilities

| Input | Default application use | Requirement | Status |
|---|---|---|---|
| Authorized local audio | Internal browser DSP | User-selected signal and supported browser codec | Experimental estimates/review |
| Explicit manual input / tap | User-created BPM evidence | User action | Protected from automatic replacement |
| Imported historic BPM | Preserve original value and provenance | Existing project data | Not relabelled as internal/verified |
| Discogs metadata | Recording/tracklist information | CSV or permitted metadata access | Does not imply a BPM/audio source |
| IA/FMA CC0/BY catalog | Development-only automatic research path | Curated collection, current per-item/file rights and identity checks, browser CORS download | Real control source/decode proof; all review; commercial target coverage unknown |
| AcousticBrainz adapter | None automatically | Explicit research request and recording MBID | Isolated adapter/probe only |
| GetSongBPM | None | No key is read | Integration retired 2026-11-07 |

No new external provider replaces the retired integration. The current engine
requires audio and independent musical validation remains a separate gate.
