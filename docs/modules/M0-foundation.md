# M0 — Foundation

## What was built
- Backend: `/api/v1` router, request logger, standard response envelope (`utils/response.js`), `AppError` + error handler (404 + 500), `pg` pool with `withTransaction`, `GET /api/v1/health` with a DB round-trip.
- Env: backend reads `Pravi/.env` (repo root). Frontend reads `frontend/.env.local` (public values only).
- Database: `database/migrate.mjs` applies `database/migrations/*.sql` in order, tracked in `schema_migrations`. `001_init.sql` enables `pgcrypto` and adds `set_updated_at()`. `database/seed/index.mjs` is the ordered, idempotent seed runner (no steps yet).
- Frontend: light theme tokens in `tailwind.config.ts`, fonts via `next/font` (Space Grotesk / Inter / Fira Code), UI kit in `components/ui/*`, `AppShell` layout, `lib/api.ts` envelope-aware fetch client, status page at `/`.

## How to test
```bash
npm install
npm run migrate -w backend     # "1 migration(s) applied."
npm run dev                    # frontend :3000, backend :4000
curl http://localhost:4000/api/v1/health
```
Open http://localhost:3000 — the status card shows API OK, Database OK and DB latency. Stop the backend and press Recheck to see the error state.
