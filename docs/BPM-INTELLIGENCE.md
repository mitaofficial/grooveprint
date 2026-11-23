# GROOVEPRINT BPM Engine — experimental

The product uses its own local-audio analysis path. It has no BPM database signup,
API-key activation, automatic title lookup or remote audio-processing step.

CSV import and collection sync invoke `GrooveprintCollectionEnrichment.run` only
for tracklist metadata. Without audio, missing BPMs stay empty and the application
remains usable for cataloging, manual edits and printing.

CONNECT AUDIO LIBRARY accepts an authorized folder or supported file selection.
The browser matches recording names conservatively, decodes sequentially and runs
the original detector in a module worker. It shows estimates/candidates, supports
Stop, protects manual values/clears and never uploads audio, PCM or waveforms.
The browser tab must remain open; native full-file decode cannot be interrupted,
so cancellation discards late output and holds the resource lock until cleanup.

VEDI CANDIDATI opens a release requiring review. Selecting a candidate records an
estimate; CONFERMA BPM requires explicit checking/correction and marks it verified.
Historical external BPMs stay external, with saved source/reference details. No
migration relabels a previously imported catalog value as internal analysis.

The production baseline and benchmark challenger are deliberately separate.
Musical accuracy on independently verified complete recordings remains unproven;
no calibrated confidence or universal BPM Pro accuracy is claimed.
