# Remaining limits — 7 November 2026

1. BPM V2 is available only as explicit development/standalone local comparison;
   V1 remains default and production does not serve V2. See BPM-INTEGRATION.md.
   All 31 repeated publisher-labelled pilot loops
   still require review; independent full-track accuracy and useful commercial
   automatic coverage are not established. See WORK-CHECKPOINT.md and evidence/.
2. Discogs CSV provides metadata, not signal or an implied tempo. The retired
   catalog integration has no active client, key reader or fallback. Local analysis
   needs authorized audio; the archive adapter is isolated research. Connected
   Discogs regression flows use mocks unless explicitly marked live.
3. Local jobs need the tab open. A running decode cannot be aborted through Web
   Audio; stop discards its result and holds the single-decoder lock until cleanup.
   Native decode can allocate the full file before the 128 MiB PCM check. Neither
   file-size limits nor JS heap counters guarantee a fixed native peak.
4. Controlled 1500-item scheduling is verified; real browser resource cycles reuse
   one original 22-second WAV. Long diverse-codec/end-user-device endurance is not
   established. Filename extensions do not guarantee decodability; Firefox 144
   rejected generated AIFF while MP3/FLAC/M4A/Ogg/Opus/WAV worked.
5. A 390x844 touch viewport is not a physical phone. Local Chromium launch/download
   and WebKit system-dependency installation were environment-blocked. Use the
   final CI matrix for actual Chromium/Firefox/WebKit verification.
6. PDF export remains vector/Base-14 fonts with WinAnsi limits; fonts are not
   embedded. Unsupported characters require browser printing or a supported font
   path. Physical 100% scale / printer margins still need a measured print test.
   Final PDF byte assembly is synchronous; 3000-label heartbeat observations are
   diagnostics, not a universal timing guarantee.
7. Exact artist/version matching intentionally abstains on ambiguity, spelling
   differences, duplicate recordings or competing files. It does not infer a remix
   identity from a shared title. User evidence is bounded and persisted separately
   from short-lived provider snapshots; no source-retention period was extended.
8. Live OAuth, real account/session failures, commercial security/billing readiness
   and production deployment were not part of these verified local changes. No
   main merge or Railway change is authorized by passing tests.
