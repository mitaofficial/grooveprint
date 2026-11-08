# GROOVEPRINT — zero-track V1/V2 incident and evidence (2026-11-08)

## Reproduction and state distinction

Incident screenshot: Windows local dev preview, REVIEW, selected **Josh Woodward / Crawford Street**, Discogs release **3759149**, `1 release / 0 tracks / 0/0 BPM`, checkbox enabled and experimental engine selected. Clicking **CONFRONTA V1/V2 CON AUDIO AUTORIZZATO** produced no visible response. This user observation was real; a prior green CI did **not** certify that user's local browser/checkout.

The historical failure combined two separate facts:
1. `index.html` `gpRetainLocalOnly()`, `loadLocal()` and `gpExpireSources()` deliberately remove/expire Discogs-derived tracklists under source-retention rules, so an old locally persisted release can become a **zero-track shell**. This restriction must remain; preserving Discogs content in backups is **not** the fix.
2. The earlier `src/bpm-auto.js` comparison path assumed analyzable track rows already existed, could silently make a zero-work plan, and did not consistently surface recoverable source errors. `data-gp-auto-compare` being present is not proof that metadata recovery / the DSP chain ran.

A separate QA defect was identified: `scripts/bpm-compare-e2e.mjs` initially allowed the **live** test to pass with `job.phase='error'` and merely record the error as a result row. This false-positive criterion was corrected: live success now requires a nonempty authentic tracklist, completed processing, at least one review estimate, actual V1 and V2 outputs, unchanged numeric BPM, and released worker/context. Upstream failure must fail the live job while preserving its screenshots/report.

## Implemented behavior and boundaries

- `src/bpm-auto.js`: explicit one-click workflow with phase transitions, persistent errors, owned cancellation, comparison-scoped record, visible build SHA and sanitized in-memory trace. Uses `ensureTracklistForComparison(record, signal)` before scheduling any DSP work. The public demo is verified by ID **plus** artist and title via the development server; generic valid releases use public Discogs tracklist recovery. Correct identity and freshness are checked before applying a tracklist.
- `src/bpm-library.js`: one authorized recording is decoded once and both V1 and V2 are computed from its same PCM, with review-only output and protected manual/verified BPM values.
- `server/app.mjs`: only the development server exposes the rights-checked FMA/Internet Archive research endpoints; `main`/Railway are not deployed. The on-page build SHA comes from `scripts/dev.mjs`.
- `tests/browser-smoke.mjs` and `scripts/bpm-compare-e2e.mjs`: true browser event clicks, real app server, DOM and download/worker chain, screenshot and sanitized network evidence. Fixture mode only mocks *external providers* and uses generated actual audio and the actual browser DSP, never mocked BPM results. Public-service live mode must validate the actual authorized source.
- Source retention, version/remix checks, CSRF, rate limits, expiry, manual BPM protection, and review-only semantics are preserved. No commercial-audio rights or universal BPM precision are implied.

## Verified evidence and epistemic limits

- CI **#158**, head `77ccb2d8a3929701e92764627404d5a37a5a228c`, passed Node tests, Chromium/Firefox/WebKit desktop/mobile smoke, **10 legacy + 10 fresh one-click fixture runs per browser**, and a separate live Chromium provider run. See https://github.com/mitaofficial/grooveprint/actions/runs/42515284700.
- Browser screenshots and JSON state/network logs are stored as run artifacts, not in the source tree:
  - Chromium fixture: https://github.com/mitaofficial/grooveprint/actions/runs/42515284700/artifacts/13630149938
  - Firefox fixture: https://github.com/mitaofficial/grooveprint/actions/runs/42515284700/artifacts/13631087795
  - WebKit fixture: https://github.com/mitaofficial/grooveprint/actions/runs/42515284700/artifacts/13631610271
  - Live browser: https://github.com/mitaofficial/grooveprint/actions/runs/42515284700/artifacts/13631241979
- CI **#159** introduced fail-closed live assertions; its live browser *job* passed, although the workflow was superseded. In subsequent **CI #161** on `da5197c`, the stricter live gate exposed one **`Failed to fetch`** external audio download in a 14-track run. This is real failure evidence, not proof of a zero-click or DSP calculation deadlock; the UI reported `complete-with-errors` and kept Retry visible. The error evidence (first-pass screenshot/log) is in https://github.com/mitaofficial/grooveprint/actions/runs/42519645053/artifacts/13632742844. The live validation now clicks the actual **Retry errors** button **once**, records the first failure separately, and requires a completely clean result to pass; it never silently ignores recurring provider errors. The final head needs its *own* green CI check.
- This session's container cannot clone GitHub directly (`Could not resolve host github.com`) and cannot reach the user's Windows `127.0.0.1`. Real browsers therefore ran in the **GitHub Actions runner**, whose screenshots/logs are linked above. Do not claim the user's exact Windows profile has been exercised or the production site changed.
- A passing controlled fixture run establishes deterministic UI/worker mechanics, **not** generalized live commercial audio source coverage or independently validated musical tempo accuracy.

## Windows handoff and acceptance

1. Export a JSON backup of any user-owned project if needed. In PowerShell, within `grooveprint`: `git status --short`. If there are unexpected local changes, preserve them rather than forcing a reset.
2. Stop the old server with **Ctrl+C**; execute `git pull --ff-only`; launch `npm run dev`.
3. Verify the terminal's `GROOVEPRINT development HEAD` SHA, open `http://127.0.0.1:4173/`, press **Ctrl+F5**, and verify the matching **Preview commit** shown in the BPM panel.
4. In REVIEW, select the existing empty `Josh Woodward / Crawford Street` release. Click **CONFRONTA V1/V2 CON AUDIO AUTORIZZATO** **once**. Expected: `preparing` → `recovering-tracklist` → `resolving-audio`/analysis → review/complete, with tracks visible and V1/V2 candidate data; **or** a persistent specific error and the Retry action if the upstream service is unavailable.
5. Do not select a BPM merely from an autocorrelation score. No value becomes verified automatically. For a failure, capture the current `Preview commit`, `job.phase` and displayed message (and browser console/network, if possible). A localhost URL from a CI runner is not a public preview.

## Still outside the pass claim

Physical Windows browser storage and environment, independent full-track hardgroove/vinyl accuracy, unrestricted commercial catalog sources, source licensing for paid tracks, and a hosted HTTPS branch preview were not independently established. Do not merge, purchase services, expose credentials, bypass rights checks, or deploy to Railway production without explicit authorization.
