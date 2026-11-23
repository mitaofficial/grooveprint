# music-tempo 1.0.3 — MIT

Source: https://github.com/killercrush/music-tempo
NPM tarball SHA-512 (base64):
`qAocTKLp3jaSeJLeGs98mkkpLYDFM1VCevA1OPFJvLPkHlzwTLUxChXMgnxZRHKSJQ13DuaT+Fr51BEUb2D4pQ==`

Copyright (c) 2017 killercrush. The full MIT notice is in `LICENCE`.
BeatRoot method: Simon Dixon. No other example assets or dependencies included.

Only five ES modules are vendored. Changes: `.mjs` Agent import, attribution
headers, normalized trailing whitespace/line endings, and a 1024-agent fork budget which throws instead of silently pruning.
The wrapper does not use the upstream `MusicTempo` constructor or `calculateSF`
whole-input Array conversions. It computes channel-safe streaming FFT flux,
supplies `timeStep = hop / actualSampleRate`, and retains measured onset events
separately from interpolated beats. The upstream standalone constructor is used
only as an untouched research comparator before evaluating this wrapper.

No network requests, audio files, models or additional install step.
