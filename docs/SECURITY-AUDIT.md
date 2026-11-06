# Security audit — limited alpha review

Implemented/retained: secrets in server environment; OAuth token pairs encrypted in SQLite; HttpOnly SameSite session cookie; CSRF token on POST API; bounded batch size (1–12, frontend 4); auth required for BPM lookups; source URL validation; public /health and static script; provider timeout and per-user throttling.

Automated server smoke test asserts unauthenticated BPM batch requests cannot call the provider and GET /api/bpm/status reveals only configured boolean, not key value.

**Not a full penetration test.** Still to assess: CORS/CSP in deployed browser, CSRF through every endpoint, session fixation, cross-user isolation, fuzzing of Discogs mapping, comprehensive XSS/DOM sinks, API cost exhaustion from concurrent sessions, durable job authorization and rate-limit persistence.

Repository visibility is currently public. Do not commit secrets. Rotate any leaked browser cookies, OAuth tokens or API secrets.
