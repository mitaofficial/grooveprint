# GROOVEPRINT 3.0 — current product and BPM status

Development is confined to PR #3 / `feature/bpm-intelligence-3-open-data`.
No merge, main update, release, production secret change or Railway operation was
performed. Read [WORK-CHECKPOINT.md](WORK-CHECKPOINT.md) and the latest PR CI before
resuming; prior CI #90 is a historical baseline.

The base application now has cancellable bounded local-audio work, protected
manual clears/revisions, provider cancellation and restart control, recovery of
user-only evidence, complete collection navigation, strict CSV failure behavior
and progressive, cancellable vector PDF export from a frozen snapshot.

**Base product:** candidate for a scoped beta of the locally verified CSV,
collection, editor and PDF paths once the final cross-browser CI passes. Connected
Discogs behavior has deterministic mocks and two-expiry regressions; live OAuth,
physical print and real-device/native-memory endurance are not certified.

**Local BPM detector:** EXPERIMENTAL. The production baseline module is unchanged;
the revised V2 is benchmark-only and is not served to the browser. Development
results are 31/31 first choices on repeated publisher-labelled loops, 158/168
original synthetic cases and 137/144 follow-up synthetic cases. The 31 real loops
still have zero automatically accepted predictions. These are not independent
full-track musical results and do not approve BPM Pro.

**Catalog providers:** optional. Correct requests and matching are exercised with
mocks. MusicBrainz title search remains disabled; AcousticBrainz needs recording
MBIDs; no API key or new licensed PCM source was provisioned. Live availability is
not evidence of local DSP accuracy.

Remaining musical gate: authorized complete recordings, independently checked
beat-grid references, grouped development/calibration/untouched evaluation data,
and precision reported together with automatic coverage. Target objectives are
not achieved results. No calibrated probabilities or verified badges are inferred
from an algorithmic/catalog estimate.
