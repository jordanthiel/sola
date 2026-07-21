# AGENTS.md

## Cursor Cloud specific instructions

This is a single-product web app ("Sova Home"), a multi-household nanny management tool.
- Frontend: React 19 + Vite + TypeScript (root `src/`), dev server on `http://localhost:5173`.
- Backend: local Supabase stack (Postgres + Auth + Storage + PostgREST) via the Supabase CLI, plus optional Deno edge functions in `supabase/functions/`.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `preview`) and `README.md`. Notes below are the non-obvious parts.

### Required services to run the app end-to-end
1. Docker daemon must be running. It is not started automatically — start it once per session with `sudo dockerd` (run it in a background/tmux session). If the socket is owned by root, run `sudo chmod 666 /var/run/docker.sock` so the Supabase CLI can talk to Docker without sudo. Docker is configured for `fuse-overlayfs` storage driver with the containerd snapshotter disabled (`/etc/docker/daemon.json`); do not switch it to overlay2.
2. Local Supabase stack: `npx supabase start` (from repo root). This pulls images on a cold VM and applies all migrations in `supabase/migrations/`. API is on port **55321**, DB 55322, Studio 55323, Mailpit/Inbucket 55324. Reset data with `npx supabase db reset`.
3. Frontend: `npm run dev`.

### Environment file (not committed, must be recreated)
The root `.env` is gitignored and there is no `.env.example`. The app reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.ts`). For local Supabase, create `.env` with:
```
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_ANON_KEY=<anon key from `npx supabase status`>
```
The anon key printed by `npx supabase start`/`status` is a stable local default and does not rotate between runs.

### Optional services (safe to skip for core flows)
The three edge functions (`send-email`, `gusto-api`, `gusto-webhook`) are optional and require external credentials (Resend, Gusto) in `supabase/functions/.env` (template: `supabase/functions/.env.example`). Core flows (auth, households, schedule, children, hours, payroll preview, PTO, feed, documents) work without them.

### Gotchas
- `npm run lint` currently reports pre-existing errors/warnings in the repo (mostly in `supabase/functions/**` and a few React-hooks warnings). These are not caused by environment setup.
- Local auth has email confirmations disabled (`supabase/config.toml`), so sign-up logs you straight in — no email step.
- Edge functions have `verify_jwt = false` locally (they do their own auth), which simplifies local invocation.
