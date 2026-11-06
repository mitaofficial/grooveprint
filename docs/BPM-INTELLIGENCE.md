# Automatic BPM — alpha functional contract

**Zero-click trigger:** CSV import and successful Discogs collection sync automatically invoke the BPM pipeline; tracklists are optionally fetched when permitted. A manual "ANALIZZA BPM" button is not part of the primary collection workflow.

The pipeline only does data lookup without audio. It calls `POST /api/bpm/batch` with up to four tracks per request. The server requires a Discogs OAuth session and CSRF token, validates inputs, rate-limits calls, and forwards each query to GetSongBPM if `GETSONGBPM_API_KEY` is set. Without the key it reports `provider-unavailable` and preserves all data. CSV-only users without OAuth can use CSV, label editing and printing but cannot use the authenticated provider route.

**Matching:** require exact normalized track title and track artist; numeric Discogs artist disambiguation suffix is stripped only during display/matching. Preserve remix/edit/dub version qualifiers. Multiple conflicting exact BPMs -> REVIEW, not auto-assign. Known BPM/manual overrides always win. Per-track VA artist information is preserved when supplied by Discogs.

**Statuses:** catalog (unverified external data), review (ambiguous), unavailable (no result), provider-inactive (no key). Values from an external catalog appear with ~ in the print layout until verified.

**Limitations:** BPM analysis of audio does not follow from Discogs metadata. YouTube iframe playback cannot be used as a decoded PCM source. DSP is not silently executed on streaming links. This alpha orchestrator runs only while the tab is open. Source catalog availability, result coverage and accuracy have not been benchmarked on real techno recordings.

Attribution: https://getsongbpm.com/ and /credits.
