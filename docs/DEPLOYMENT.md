# Deploy and rollback

Working branch: `feature/zero-click-bpm-mvp`. Production Railway project must remain on `main` until CI passes and code review is completed.

When merging to main, Railway deploys from GitHub. Confirm Dockerfile copies `src/` and `server/`; health `/health` and new `/assets/auto-bpm.js` both return 200. Check `/api/bpm/status` and logs. Test that GET `/credits` contains a public GetSongBPM backlink.

Required secret variables: DISCOGS_CONSUMER_KEY, DISCOGS_CONSUMER_SECRET, SESSION_ENCRYPTION_KEY, SQLITE_PATH, PUBLIC_ORIGIN. Optional: GETSONGBPM_API_KEY. NEVER place secrets in GitHub, frontend or bug reports.

Before deploying: save a snapshot/backup of the data volume and old deployment ID. On failure, use Railway rollback/redeploy prior stable deployment. Do not remove or remount `/data`.
