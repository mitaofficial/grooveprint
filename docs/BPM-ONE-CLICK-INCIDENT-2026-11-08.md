# GROOVEPRINT — zero-track V1/V2 one-click incident

Date: 8 November 2026. Repository: `mitaofficial/grooveprint`. Scope: draft PR #3 / `feature/bpm-intelligence-3-open-data`; **production and main unchanged**.

## User-visible reproduction and causal analysis

The Windows user captured a valid local REVIEW page with exactly one selected `Josh Woodward / Crawford Street` release, Discogs release ID `3759149`, no tracks and `0/0` BPM progress. The V1/V2 button was enabled but gave no visible indication of a useful outcome. The prior CI #136 passed while the user still had this failure.

Source audit identified interacting design flaws:
1. `index.html` intentionally strips Discogs-derived tracks and transient research examples in `gpRetainLocalOnly()` and `loadLocal()`; older saved local records may therefore survive with legitimate album identity but `tracks=[]`. On its own this is a data-retention rule, **not** proof that remote audio is present.
2. The old `compareEngines()` filtered candidate releases through `fresh()` *before* ensuring a tracklist. A stale/stripped record could be rejected prematurely, and a preparation error was not always persistently reported. The prior implementation also reused the user-facing `example()` action that creates/reuses entries rather than a dedicated operation bound to the currently selected record.
3. The previously green browser regression reconstructed a demo by mutating `state.releases` in memory; it did **not** test a genuine browser profile seeded with legacy persisted storage followed by startup and physical button interaction. It also did not store before/immediate/after screenshots.
4. A later change narrowed comparison scope to the selected release. An old browser smoke assertion continued expecting an obsolete cumulative count; browser diagnostics showed `job.total=8, job.done=8`, not the stale expected value `5`, because normal automatic import correctly caught up the previously deferred second release. The assertion was corrected to match the demonstrated state rather than hiding the result.

The exact historical reason the user's original Windows click was silent cannot be recovered from screenshots alone (no browser console/network trace was available). The source-level guards above were genuine reliability gaps; final runtime behavior is established separately by the independent live browser proof below.

## Implemented branch changes

- Development-only one-click comparator immediately acknowledges the action and records state transitions in the UI (`preparing`, `recovering-tracklist`, `resolving-audio`, `searching`, `analyzing`, `complete`, `error`, `cancelled`), with a capped sanitized diagnostic trace. No accepted-looking `0/0` after a failed click.
- `ensureTracklistForComparison(record,signal)` validates the record identity and uses the public research endpoint only for the *canonical exact* demo identity from the server, rejects empty/stale/wrong release metadata, hydrates the selected record without duplication, and uses the ordinary public Discogs recovery flow for other releases. It never manufactures track titles.
- Comparison analyzes only the active release, not an arbitrary album; the normal import queue is free to resume other unprocessed releases after the comparison completes. Double clicks, manual stop and late work are guarded.
- All numeric audio outputs remain **review-only**; V1 and V2 use the same decoded PCM in the comparison worker; manual and verified user BPMs remain protected. Source rights, CSRF and original upload limits are not relaxed.
- Recovery errors are shown persistently in the research panel. A zero-track error is retryable via the visible Retry action. Development startup and BPM status expose the Git HEAD to detect a stale local server; this is never exposed by production.
- Browser-specific evidence runner `scripts/bpm-compare-e2e.mjs` starts the actual dev server and clicks visible controls in Playwright, saves sanitized network/status traces plus before/during/after screenshots. Provider-fixture tests exercise real audio decoding and DSP rather than mocking the algorithms.

## Measured evidence (GitHub Actions CI #144, SHA `3335d292524cfca6f4d0d061d133480bee101c8f`)

The dedicated Playwright evidence runner on the incident fix snapshot recorded:
- Chromium: **10/10 persisted-legacy** and **10/10 fresh-browser** journeys passed, plus a 503-response injection captured. Zero page errors.
- Firefox: same **20/20** journeys; zero page errors.
- WebKit: same **20/20** journeys; zero page errors.
- Fixture mode explicitly intercepts Discogs and authorized-source API responses. The original deterministic audio is encoded as MP3; real browser `AudioContext` decoding and both V1/V2 DSP workers run. **Do not present 60 fixture journeys as 60 live-provider successes.**
- **Independent live Chromium trial** with no Discogs or audio-source mocks: seeded legacy browser storage `1 release / 0 tracks / 0/0`; after one real click, `/api/audio/example` returned HTTP 200, **14** `/api/audio/resolve` requests returned HTTP 200, and the browser downloaded/decoded available authorized recordings. Final: **14/14 processed, 13 review candidate sets, 1 unavailable, 0 request/analysis errors**. On track 1 the comparison recorded both `grooveprint-onset-acf-v1` and `grooveprint-onset-acf-v2-experimental`; `bpm=null`, status `review`. AudioContext/worker counters returned to zero. Elapsed approximately 24.4 s for this live job. No page errors.
- Live before-click screenshot, after-click screenshot and final screenshot plus sanitized response paths/state trace: https://github.com/mitaofficial/grooveprint/actions/runs/42513591257/artifacts/13630243493
- Playwright fixture screenshots and report archives:
  - Chromium: https://github.com/mitaofficial/grooveprint/actions/runs/42513591257/artifacts/13630761149
  - Firefox: https://github.com/mitaofficial/grooveprint/actions/runs/42513591257/artifacts/13630696460
  - WebKit: https://github.com/mitaofficial/grooveprint/actions/runs/42513591257/artifacts/13630477234

**CI #144 was not fully green**: its legacy broad browser-smoke suite retained the obsolete count expectation described above. The new dedicated browser evidence and live provider probe independently passed; the count assertion was fixed in a later commit. The entire required CI must be green on the *final* HEAD before release handoff. Do not substitute this earlier run.

## Remaining limits and explicit non-goals

- This live record is licensed indie-folk control material, **not** a commercial hardgroove/techno audio-coverage proof.
- Signal analysis yields hypotheses; musical top-1, octave-disambiguation and reliability on independent real audio remain unvalidated. Do not auto-accept/print estimated BPM.
- Discogs/Internet Archive can become temporarily unavailable. Retry must respect the original rate limits.
- A cloud CI `127.0.0.1` is never directly accessible on the user's Windows PC. Without a separately authorized preview deployment, test via the local dev server (`npm run dev`, browse http://127.0.0.1:4173/). No production changes, costs or credentials.

## Windows handoff

In existing PowerShell at the Grooveprint repo:
1. Stop the current server with `Ctrl+C`.
2. Check local changes with `git status --short` (do not discard user changes).
3. `git pull --ff-only` then `npm run dev`; Node >=22.13. No `npm ci` without package-lock.json.
4. Confirm the printed `GROOVEPRINT development HEAD` and the 12-character `Preview commit` indicator in REVIEW match the expected branch HEAD, then hard-refresh `Ctrl+F5`.
5. On the existing empty Josh Woodward demo (1 release, 0 tracks), click **CONFRONTA V1/V2 CON AUDIO AUTORIZZATO** **once**. Expect `Recupero tracklist...` immediately, then progress, then V1/V2 review candidates or an actionable upstream error. Use Retry on upstream failure. Do not press `USA QUESTO BPM` without checking the original audio.
