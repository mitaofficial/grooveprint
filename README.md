# GROOVEPRINT
Vinyl workstation with Discogs OAuth backend.

Deploy to Railway with a persistent volume at `/data`. Configure `NODE_ENV=production`, `PUBLIC_ORIGIN=https://grooveprint-web-production.up.railway.app`, `SQLITE_PATH=/data/sessions.db`, `SESSION_ENCRYPTION_KEY` (64 random hex digits), `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET` and `DISCOGS_USER_AGENT` in Railway variables. Never commit secrets.

Discogs OAuth callback: `https://grooveprint-web-production.up.railway.app/api/discogs/callback`.

Health: `/health`. Discogs API status: `/api/discogs/status`.

This is alpha software. Test a single collection folder before broader use. API use and commercialization are subject to Discogs terms.
