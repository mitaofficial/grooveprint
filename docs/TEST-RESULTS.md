# Test plan & evidence — alpha

Tests in this branch: `tests/bpm-match.test.mjs`, `tests/auto-bpm.test.mjs`, `tests/frontend-syntax.test.mjs`, `tests/server-smoke.test.mjs`.

Runner: `npm test` plus `npm run test:syntax` and `node --check src/auto-bpm.js`, invoked by GitHub Actions workflow `.github/workflows/ci.yml`.

Assertions: strict Discogs artist matching, remix vs original version separation, conflicting BPM review, no-key behavior, manual edit precedence, no-login provider guard, frontend scripts parse, actual Node server startup, static worker route, /health, /credits and unauthenticated batch denial.

Not verified: actual Discogs OAuth flow with live user, GetSongBPM responses with real key, full browser UI/YouTube rendering, real-audio DSP accuracy, PDF physical print measurements, large collection performance. Do not equate CI success with full production verification.
