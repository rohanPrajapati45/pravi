# GujInfra 360

Asset lifecycle management for Gujarat Roads & Buildings infrastructure — one identity and one timeline for every road, bridge, and building. See [docs/PRD.md](docs/PRD.md).

## Setup

1. Copy `.env.example` to `.env` and fill in the Supabase values.
2. Create `frontend/.env.local` with the `NEXT_PUBLIC_*` values listed at the bottom of `.env.example`.
3. Install, migrate, run:

```bash
npm install
npm run migrate -w backend
npm run dev
```

Frontend: <http://localhost:3000> · API: <http://localhost:4000/api/v1/health>

Module notes live in [docs/modules/](docs/modules/).
