# StoryFrame Background Worker — current implementation

This is an **initial durable generation worker**, not a complete video renderer.

## Requirements
- Node.js 24+, network access to MongoDB Atlas and deployed StoryFrame
- Set environment variables securely on your worker host (never commit values):
  - `MONGODB_URI` — Atlas connection string
  - `MONGODB_DATABASE=storyframe`
  - `STORYFRAME_BASE_URL` — your deployed StoryFrame URL
  - `STORYFRAME_PIPELINE_TOKEN` — worker secret used by the job API
- Start from repository root: `node workers/storyframe-worker.mjs`
- Keep the process alive with a supervisor (systemd, container restart policy, etc.).

## Current behavior
1. Polls MongoDB `pipeline_jobs`, atomically claims queued or expired-lease jobs.
2. Renews lease while working; limits failed attempts to five.
3. Calls existing StoryFrame analysis, scene image, and narration endpoints.
4. Writes durable per-step checkpoints to `pipeline_assets` so a restarted worker can skip finished API calls.
5. Writes phase and error events to `pipeline_events`.
6. Ends in `render_pending`, **not completed**, because the existing video export is browser-dependent and a server-side renderer is still required.

## Known limitations / do not claim E2E success
- Not deployed or runtime-tested yet.
- Does not yet support pause/resume controls, Google Sheets, dashboard or actual video output.
- Long narration beyond 12,000 characters is currently truncated and needs chunking.
- MongoDB checkpoint records store API responses; check response sizes and move large audio blobs to media storage before production.
- Worker calls existing HTTP routes; secure those endpoints appropriately before making a public multi-user service.
- The `pipeline_jobs` POST API is protected by a bearer token; never expose that token to browser JavaScript or Google Sheets.
- An expired lease can cause duplicate requests if a previous worker is still active; strict distributed fencing and provider-side idempotency are future hardening.
- For actual 24/7 execution deploy to a persistent VPS or suitable managed worker service; a Vercel request handler is not a persistent worker.

## Smoke tests (after deployment)
1. Start worker and verify startup log.
2. Submit a short test job through authenticated server-to-server POST /api/pipeline/jobs.
3. Observe `pipeline_jobs` transitions queued → running → render_pending.
4. Verify analysis, image and narration checkpoints and event logs.
5. Kill and restart worker during image generation; verify no completed step is repeated.
6. Validate that no download link is displayed before a real server-rendered video exists.
