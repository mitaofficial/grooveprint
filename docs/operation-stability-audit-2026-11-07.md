# GROOVEPRINT OPERATION STABILITY — preliminary audit (2026-11-07)

## Verified initial state
- PR #3 (`feature/bpm-intelligence-3-open-data`) is open, draft, mergeable with `main`; HEAD before patch `46b25a892c597281e36d8917e17c3cf17123297c`. Mergeable is not proof of functional correctness.
- The previous CI #87 is green for unit tests, Chromium, archive provider and licensed audio pilot. That is a historical baseline, not a musical BPM accuracy certification.
- `index.html` is a large single-file UI (~230 KB, 1192 physical lines) whose `renderApp()` rebuilds the app `innerHTML`. UI list filtering and label composition operate on active collection data. This is a performance risk; no before/after performance measurements have been made.
- `src/bpm-library.js` uses Web Audio for local sequential analysis and retains manual BPM data. No changes to DSP or source matching are authorized during stability work.
- CI had no concurrency cancellation and duplicated some syntax validation; package scripts lacked a single pre-push gate.
- Container entrypoint and Railway `startCommand` differ. Actual Railway deployment behavior has **not** been tested or changed.
- GitHub connector exposes repository version and PR, not a developer's uncommitted local working tree. No claim is made about local uncommitted modifications.

## Stability patch
- Add a fast offline Git-index guard against committing private audio, databases or environment files; verify package/railway JSON and required ignore rules.
- Add `npm run validate` for offline repository guard, node unit tests, syntax checking and a small deterministic synthetic BPM benchmark.
- Add concurrency cancellation for superseded PR/feature runs; **never automatically cancel `main` push checks**.
- Retain separate browser, external-provider and CC BY 4.0 loop pilot jobs. Provider and publisher-labelled BPM results remain evidentiary, not validated musical BPM.
- Add fixture tests for a clean repository, accidentally tracked private audio/.env, and invalid Railway JSON.

## Remaining gates
- Profiling of 50/250/500/1000/3000-release collections in real Chromium on repeatable fixtures; report durations and heap, then optimize only measured bottlenecks.
- Real cross-browser review of editor, PDF geometry (including 105 x 74.25 mm), and large audio library cancellation/resource lifecycle.
- Independent full-track BPM validation and accepted precision **with** coverage before enabling DSP V2 for production.
- License/rights approval of any new third-party beat tracker.
- No merge and no Railway deploy until these gates are explicitly reviewed.

## Operator workflow
Run `npm run validate` in a normal Git checkout before committing. Browser smoke requires Playwright and Chromium; hosted API probes require network and may fail independently of code. The CI uses `npm run validate` as its fast source gate. Do not interpret cancelled superseded PR runs as product failures.
