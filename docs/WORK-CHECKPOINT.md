# GROOVEPRINT — current checkpoint: product audit and usable trial

7 November 2026. This section supersedes earlier next-action instructions about
restarting the general audit. The attached product-trial mandate was read in
full. Baseline: `25bba4fa464065c5ec6afb628201b50fd64df925`, clean checkout, PR #3
open/draft/mergeable, CI #92 passed; main
`28f9fd9ed699ec13c4ab4108ca2266159715e73c`. Main and Railway remain protected.

## Implemented in this audit

- `npm run dev` starts the complete server without manual secret setup, with a
  random in-memory key/SQLite session store and production-mode refusal. It
  never opens an inherited database path. Existing production start is unchanged.
- Escape imported IDs in review row/checkbox HTML and preserve the raw identifier.
  Native title buttons allow keyboard activation without changing the row workflow.
- Correct stale automatic-provider BPM copy and the 2.0 document title. Local
  estimates, historical values, manual edits and the original detector are intact.
- Separate missing-tracklist warnings from physical layout overflow in preflight.
- Keep Save/Guide directly reachable on narrow viewports.
- Add fictional downloadable CSV (5 releases, 12 tracks, accents/quotes, duplicate
  copy; no real release IDs or BPM), an explicit server allowlist and Docker copy.

## Evidence and use

Read `docs/PRODUCT-AUDIT.md` for reproduced problems, exact scope/limits and seven
ranked proposals. `docs/USER-TEST-GUIDE.md` gives access instructions, local commands,
ten user steps, sample expectations, print calibration and a feedback format.
Sanitized results/hashes: `docs/evidence/product-audit-2026-11-07.json`.
Raw intermediate logs are ignored under `.private/checkpoints/product-audit/`.

Offline suite: 63 tests (59 prior + 4 meaningful launcher/output/preflight cases),
syntax/config/privacy and synthetic smoke. Firefox 144.0.2 desktop + 390x844 touch
full flows passed. The new separate guest context uses real, unauthenticated
server routes without API mocks: CSV download/import, keyboard opening, manual
BPM, design, 2-page PDF, adversarial JSON IDs, backup/reimport and reload. It makes
zero BPM API requests. Existing seven PDF presets remain byte-identical between
sync/progressive paths; audio stop/expiry/legacy guards remain in the browser suite.
Latest PR CI, not #92, must certify this audit's final HEAD; retain the seven jobs
and required aggregate `browser`. No source DSP files changed or were promoted.

The managed preview serves the whole app at internal `http://127.0.0.1:4173/`.
The user needs the session browser control/handoff; that loopback address is not
a public link on their PC. Preview lifetime is not guaranteed and maintenance
may stop it. For private data/audio, run `npm run dev` on the user's own device.
Use fictional data for this remote trial. Do not register another public hosting
service or deploy to Railway to work around this boundary.

Docker CLI/image build, live OAuth, physical phones/print, native-memory endurance
and independently verified complete-recording BPM holdout remain unverified.
All three detector/worker hashes remain those in the preceding removal report.

## Next action

Have the owner complete the ten-step CSV/editor/PDF trial and report the first
specific friction. The first implementation proposal is a clearer primary CSV
entry with progressive optional Discogs/audio panels, based on the dense initial
screen. Keep musical accuracy work on the independent-authorized-full-recording
protocol; do not rebuild a provider or infer accuracy from integration tests.
No merge, deploy, secret change or Railway operation was performed or authorized.

---

## Historical checkpoint: catalog removal (still applicable where not superseded)

# GROOVEPRINT — current checkpoint: internal engine, catalog removal

Date: 7 November 2026. This section supersedes the historical stabilization record below.
Starting branch HEAD: `a644c8ef549b38a03147adcfd4c25dc5f8a910b9`; PR #3 was open,
draft, mergeable and CI #91 passed all seven jobs. Main remains
`28f9fd9ed699ec13c4ab4108ca2266159715e73c`. Shell checkout was clean.
No main update, merge, deploy, secret/environment change or Railway operation is authorized.

## Product decision and implementation

GetSongBPM is **removed from active integration**, superseding the former optional
provider decision. It has not been replaced with another BPM service.

- Delete `server/bpm-match.mjs`, the server client/key reader and remote catalog
  processing. Old GET lookup / POST batch return `410 BPM_CATALOG_RETIRED`; origin,
  CSRF and throttling safeguards remain. A valid old key has no effect.
- `/api/bpm/status` describes the experimental local-audio engine: audio required,
  no upload, no catalog lookup, unchanged baseline algorithm. Discogs status has
  no provider-configuration field.
- Replace `src/auto-bpm.js` with `src/collection-enrichment.js`. All callers,
  lifecycle/busy checks, owned cancellation and restart epochs now concern only
  metadata/tracklists. It never assigns BPM or calls a catalog/archive endpoint.
- Remove fixed credits, setup/signup messages, catalog panels, controls, cache and
  request functions. Remove the obsolete asset and update syntax/package scripts.
- Separate `gpLocalBpmCandidates` / `chooseLocalBpmCandidate` from historic provenance.
  Selecting a local candidate stays `estimated`; explicit confirmation sets `verified`.
  The engine panel and VEDI CANDIDATI provide the internal-audio path.
- Preserve existing external BPM, raw source, reference URL, manual/verified values,
  clears, project JSON and user evidence. Stored HTTPS references are sanitized when
  displayed; they do not trigger automatic lookup or relabel data as internal DSP.
- The explicit archive adapter and availability probe remain isolated research;
  neither stored MBIDs nor CSV import invokes them as fallback.

Default product flow: CSV/Discogs metadata -> voluntarily connected authorized
local audio -> exact version matching -> original detector worker -> estimates /
review -> explicit confirmation -> editor/PDF. Missing BPM stays empty without
signal or existing user evidence. No external key or Discogs login is needed for
local-audio analysis itself.

## Verification

Sanitized machine-readable evidence is stored in
`docs/evidence/provider-removal-2026-11-07.json` (local runs, request counts,
preserved history, PDF comparisons and unchanged detector hashes).

- The pre-change offline suite passed 69 tests. The new suite has 59 cases:
  seven retired catalog-matcher cases were removed; 13 remote-orchestrator tests
  were replaced by eight metadata-only lifecycle tests; one backend test became
  two with/without-key authenticated egress audits; one static runtime removal
  guard was added. Browser regressions now check absence rather than mock success
  from a replacement catalog. Test-count changes reflect retired functionality.
- `npm run validate`: offline tests, syntax, repository privacy/config guard and
  synthetic smoke. `npm run test:audio-lifecycle`, `npm run benchmark:compare`, and
  the cached authorized 31-loop pilot were executed. Inspect the final command
  results and latest PR CI before relying on any historical run number.
- The backend tests run the real Node server with a test-only outbound-network
  audit for fetch/http/https. They exercise a real fixture-authorized session,
  CSRF/origin failures, internal status and retired routes both without and with
  a dummy legacy key. **Zero backend outgoing requests** in these scenarios.
- Firefox desktop and 390x844 touch viewport exercise Discogs import, metadata Stop
  with late response/queued restart, two expiry cycles, no BPM from metadata/MBID,
  actual WAV decode/worker, local candidate choice and explicit confirmation,
  1500-row navigation, seven PDF presets/cancellation, CSV errors and legacy JSON.
  **Zero BPM API requests and zero retired-host requests** through the full flow.
- Existing controlled 10/100/500/1500 queues, resource cleanup, manual-clear/revision
  barriers and 30 real decodes of the same generated WAV remain covered. These
  are not 1500 distinct real recordings or a native-memory leak proof.
- Chromium/Firefox/WebKit desktop/mobile CI and the aggregate `browser` required
  check remain intact. Local Chromium/WebKit environment limitations from the
  historical section do not imply a test pass; latest CI decides their result.

Retained provider-name occurrences are classified: negative/legacy test fixtures,
this removal record and explicitly marked historical research. Current runtime
`index.html`, `src/` and `server/` contain no retired provider name/domain/key.
Current configuration docs no longer instruct signup/key activation. Existing
historical source strings inside user-imported data are intentionally preserved.

## DSP and remaining limits

No detector or worker algorithm was changed/promoted by this removal:

- Baseline SHA-256: `63e756e1fc3868ba8e239d80d8613d34f3e9358914d62c5c2c853ef9158d3bc4`.
- Challenger SHA-256: `0dad1f5d80286818b9da3bd7cb5a45988f519542c7fa9cd26092e661024df8fc`.

Development counts remain 158/168 original synthetic and 137/144 follow-up top-1
for the challenger; 31/31 repeated publisher-labelled loops, all review-required.
These are inspected development data, not independently verified full tracks.
No confidence calibration or musical production approval follows from removal.
Full-file native decode remains non-abortable; physical phones/print and extended
native-memory endurance remain distinct, unverified gates.

Next single research action: use authorized complete recordings with independent
beat-grid references and a grouped untouched holdout in the existing corrected
benchmark. Do not rebuild an external BPM lookup or re-audit completed removal.
The source is in the development PR; an unchanged deployed site can still display
its prior implementation until a separately authorized release.

---

## Historical stabilization checkpoint (superseded where provider behavior differs)

# GROOVEPRINT — execution checkpoint, 7 November 2026

## Resume here

The operating prompt has been read in full and implemented locally against PR #3,
`feature/bpm-intelligence-3-open-data`. Initial HEAD was
`b72373f017b407ed9744f52876179dd396919e51`; initial main was
`28f9fd9ed699ec13c4ab4108ca2266159715e73c`. PR was open, draft and mergeable;
initial CI #90 passed. A real checkout and a detached baseline worktree were used,
not API-only edits. No applicable on-disk AGENTS.md was present.

Current code and the evidence files in this commit are the checkpoint. Local
Node is 24.22.1; CI retains Node 22. Publication uses the connected GitHub account
because the shell has no GitHub write credentials. Inspect the latest PR HEAD and
its CI before resuming; do not use the historical #90 result as the current check.
No main update, merge, auto-merge, deployment or Railway operation is authorized
or performed in this work.

## Reproduced defects and resulting behavior

| Defect | Correction / regression |
|---|---|
| Local library had no stop; detector blocked the UI | One decoder plus reusable module worker; real worker termination; cancel while read/decode retains the lock until it drains; no late writes or duplicate starts. `audio-lifecycle.test.mjs`, browser real WAV cycles. |
| 1500-file cap preceded filtering | Filter first; found/unsupported/empty/oversize/accepted/over-cap counts; duplicate-file matches marked ambiguous. |
| A cleared manual BPM was overwritten by a late response | Shared evidence tickets bind record, track object, version fields, BPM, source and edit revision; manual empty values are protected. |
| Stop missed archive/status requests, queued restart could survive stop | One owned AbortSignal across phases, owned tracklist cancellation, epoch-checked restart; explicit new request after stop is honored, earlier queued request is discarded. |
| User evidence could restore a prior BPM after a clear, or collide across physical copies | Persist explicit clears; opaque per-instance/version keys, compatible legacy fallback; user-only evidence included in sanitized JSON recovery backup. |
| Deferred whole-page redraw could swallow Import click | Progress updates replace only status panels and reconcile untouched BPM fields; no asynchronous whole-app redraw on focusout. Browser CSV fixture caught this. |
| Rows after 1500 had no list navigation | Visible previous/next pages over the full filtered dataset; record 2999 can be opened and exported. |
| Large PDF export occupied the UI for >1 second | Same vector builder driven incrementally; frozen export input, cancellable work, duplicate export guard. Byte-identical synchronous/progressive output on all seven actual presets. |
| Malformed CSV could still be imported | Reject unclosed quotes without replacing the current collection; empty CSV keeps data; stale file-read generations cannot replace a newer selection. |
| Benchmark dropped challenger decode failures and used prediction-only denominators | Same planned inputs for each engine; failures and invalid outputs remain rows; independent PCM copies, alternating order, 3 repetitions, both engine hashes, raw timings, explicit full/conditional metrics and Wilson intervals. |

## Architecture and ownership

- `index.html`: collection, explicit edits, import generations, Discogs/source lifecycle,
  deferred persistence, editor and PDF. PDF exports own a frozen snapshot/controller.
- `src/bpm-evidence.js`: shared write barrier; no audio or provider persistence.
- `src/bpm-library.js`: bounded sequential queue, worker/context ownership and counters.
- `src/bpm-worker.mjs`: only the unchanged production baseline detector.
- `src/auto-bpm.js`: owned provider requests, restart epochs and metadata-only lookups.
- `scripts/tempo-evaluation.mjs`: input isolation, case accounting and scoring.
- `scripts/tempo-synthetic.mjs`: original deterministic signal generator.
- `src/bpm-tempo-experiment.mjs`: benchmark-only candidate; not served or loaded by UI.

The baseline `src/bpm-tempo.mjs` remains byte-for-byte unchanged, SHA-256
`63e756e1fc3868ba8e239d80d8613d34f3e9358914d62c5c2c853ef9158d3bc4`.
No framework, build-system or production configuration migration was introduced.

## Verification and evidence

Local gates: `npm run validate`, `npm run benchmark:compare`, targeted lifecycle
and scoring tests; real Firefox 144.0.2 desktop and 390x844 simulated-touch runs
of `tests/browser-smoke.mjs`. The final local offline suite has 69 passing tests; see latest CI for its
execution counts and final browser outcomes. Browser CI now runs Chromium, Firefox and WebKit, each desktop/mobile, while
preserving the existing required `browser` check as an aggregate gate.
`ffmpeg` is explicitly available for generated codec fixtures.

Browser coverage: CSV valid/empty/malformed, two legitimate copies, import/mocked
Discogs refresh through two expiries, manual evidence restoration, local WAV
worker/privacy/cancellation, 30 repeated decodes of one original 22-second signal,
zero owned contexts/workers after each cycle, search/caret, record beyond DOM cap,
seven PDF presets, 9-label incomplete pages, accents, vector boundaries, frozen
export state and PDF cancellation. Mobile viewport is not a physical phone test.

Locally Chromium 1.57's download failed and system Chromium 156 could not create
its process-singleton socket; Firefox ran successfully. WebKit downloaded but
required system libraries could not be installed in this environment. Those
local limits are not product passes. CI installs its supported browser dependencies.
Firefox decoded generated MP3, FLAC, M4A, Ogg and Opus; generated AIFF was rejected
with EncodingError. An extension is a candidate, not a codec-support guarantee.

Controlled queue sizes 10/100/500/1500 prove scheduling and counters, not 1500
independent real-file decodes. Memory ownership counts are not a native-RAM leak
proof; Firefox did not expose JS heap memory. Full-file decode remains non-abortable;
128 MiB is a post-decode PCM rejection threshold, not a guaranteed native peak.
DSP transfer copies only two channels and at most 180 seconds at 12 kHz.

Reproducible UI comparison: `GROOVEPRINT_BROWSER=firefox node scripts/ui-benchmark.mjs`
with `--project BASELINE_WORKTREE --label baseline-final`, then `--label progressive`.
At 3000 labels, one matched run changed the maximum heartbeat gap from 1308 ms to
45 ms, with equal 38,911,671 PDF bytes / 375 pages. Wall time rose from 1303 to
1758 ms because the UI gets time to respond. Render/parse each have five raw
samples. Do not call two animation frames a complete paint trace or derive p95
from these small samples. All raw public-safe samples are in
[evidence/ui-before-after-2026-11-07.json](evidence/ui-before-after-2026-11-07.json).

## BPM experiment: frozen development profile

The experimental defaults are exported as `TEMPO_PARAMETERS`: 55–210 BPM,
180 seconds, band-agreement selection, harmonic anchoring enabled, strong-band
support ratio 0.70, combined score >=0.50, integer factors 2 and 3, review ratio
0.20. No genre/BPM prior, file-name tempo or reference value enters the detector.
Candidate scores remain uncalibrated; automatic application never means verified.

1. Independent low/full-band support promotes a faster integer-related pulse.
2. The stronger slower periodicity can anchor the faster pulse's refined tempo.
3. Conservative review also catches weak, phase-sensitive doubled alternatives.

A separate broadband-conflict review rule was tried and discarded: it did not
catch the sparse control errors. Changes were selected using development data;
the follow-up synthetic suite was inspected, so it is NOT an untouched holdout.

| Development material | Original V2 correct ±1 | Selected profile correct ±1 | Accepted / correct, final |
|---|---:|---:|---:|
| 31 publisher-labelled repeated loops | 23/31 | 31/31 | 0 / N/A |
| 168 original generated rhythmic cases | 157/168 | 158/168 | 28 / 28 |
| 144 follow-up generated rhythmic cases | 97/144 | 137/144 | 38 / 38 |

Ablation on the 31 loops: band selection alone 30/31; adding harmonic anchoring
31/31. All 31 still require review. Synthetic coverage fell when review became
more conservative; precision must always be read with coverage and sample size.
No independent full-track music accuracy was measured. A 31/31 result gives a
Wilson 95% interval of about 88.97–100% under independence, which these related
loops do not establish. Zero automatic predictions means undefined precision.

Case-by-case results, source/code hashes, attribution and raw measurements:
[evidence/tempo-publisher-development-2026-11-07.json](evidence/tempo-publisher-development-2026-11-07.json)
and [evidence/tempo-synthetic-development-2026-11-07.json](evidence/tempo-synthetic-development-2026-11-07.json).
Private audio/cache and intermediate experiments stay under ignored `.private/`.

## Gates and next single executable action

- G0: baseline checkout, PR, main SHA and initial CI identified.
- G1: local integrity regressions and Firefox flows pass; inspect latest CI matrix
  for the final commit before treating the broader browser gate as passed.
- G2: reproducible development ranking improvement, with honest coverage limits.
- G3: INCOMPLETE — authorized full recordings with independently verified beat-grid
  references and an untouched grouped holdout have not been supplied.

Next action: initialize/reuse the private manifest for a first authorized 30 full
recordings, independently verify beat-grid references using the existing Ableton
protocol, then run the corrected two-engine benchmark. Do not overwrite a curated
manifest. Do not re-run the general audit, add a provider as a substitute for
signal evidence, or enable V2 in the UI. Live OAuth with a permitted account,
physical print calibration and long native-memory/device soak remain separately
unverified and do not negate the software fixes.
