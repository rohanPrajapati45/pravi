# GujInfra 360

**One digital identity and one lifecycle timeline for every road, bridge and government building** — from the government's decision to build, through survey, sanction, tender, construction and handover, to every inspection, repair and contractor evaluation that follows.

Built for the Pravi Research *Build for Billions* hackathon. Positioned as an **asset-centric lifecycle and integration layer over existing systems** (GRMS, IWDMS, IFMS, e-Procurement), not a replacement. All data is fictitious.

- Product spec: [docs/PRD.md](docs/PRD.md) · Module notes: [docs/modules/](docs/modules/) · Demo walkthrough: [docs/demo-script.md](docs/demo-script.md) · **Handover & administration: [docs/handover.md](docs/handover.md)** · **Full walkthrough with edge cases: [docs/system-walkthrough.md](docs/system-walkthrough.md)**

---

## What it does

| Area | Highlights |
|---|---|
| **Asset registry & Asset 360** | Config-driven asset types (attributes as JSON schema), road segments with chainage, parent/child components, QR/asset-code lookup. Asset 360 answers *what is it, how did it come to exist, what happened to it, what condition is it in, what next*. |
| **Inspections** | Mobile-first form: 5-point condition, severity, defect quick-picks, camera photos (signed direct upload), live GPS with distance-from-asset check. A rating ≤ 2 or HIGH severity **raises a repair automatically**. |
| **Maintenance workflow** | `OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED` with reject loop. After-photo required; **verifier ≠ doer**; asset status follows automatically; **DLP defects are routed to the original contractor**. |
| **Work journey** | Template-driven stages → tasks → gates (New Road in full; Bridge, Building, Repair, Emergency). Required deliverables, evaluator ≠ doer, **cost-based approval escalation**, award with DLP, milestone quality rework, **handover creates the asset** with its entire pre-asset history, **explainable contractor evaluation** at closure. "Who has the file now" on every work. |
| **GIS map** | Leaflet + OpenStreetMap: clustered markers (cluster colour = worst risk inside), road segments as lines, colour by risk or condition, filters shared with the registry, "Locate me", deep link from Asset 360. |
| **Contractors & DLP** | DLP tracker (in DLP, ending soon with end-of-DLP inspection, liable-defect queue, recently ended) and contractor performance (on-time %, delay, first-pass quality, DLP defects and fix time, closure scores) — contractors see only their own firm. |
| **Risk & dashboards** | Explainable 0–100 risk score (condition, criticality, traffic, age, overdue inspection, repair history) with a "why?" breakdown and a suggested action. Role dashboards for HQ, EE, AE and contractors. |
| **Administration** | `/admin` for HQ: users (create, transfer, deactivate, reset password), offices, asset types with a form-field editor, approval limits, contractors, work templates, system health — all audited. |
| **Accountability** | Append-only audit log and asset timeline (database triggers reject edits), per-user **Activity** feed (who → whom → exact timestamp), notification bell. |

**Roles (merged for the demo):** `HQ` (Admin + Secretary/CE + SE), `EE` (EE + DEE), `AE`, `CONTRACTOR`. Jurisdiction follows State → Circle → Division → Sub-division.

---

## Architecture

```
 Next.js 15 (App Router, TS, Tailwind, Recharts) — role-aware UI, mobile-first field flows
        │  REST /api/v1 · Supabase JWT (Bearer)
        ▼
 Express API (stateless, modular monolith)
   routes → controllers/services → SQL
   middleware: auth (JWT verify + profile cache) · requireRole · jurisdiction scope · zod validation · error envelope
   engines:    workflow state machines (asset, maintenance) · stage/task/gate engine · risk engine
        │
 ┌──────┼─────────────────────────┬─────────────────────────────┐
 ▼      ▼                         ▼                             ▼
 PostgreSQL (Supabase)       Supabase Storage              (future) Redis · BullMQ worker
 RLS on, API is the only     private bucket, signed        cache dashboards · nightly
 way in; append-only         upload/download URLs          overdue scan & risk recompute
 audit + timeline triggers   (no file bytes via the API)
```

Key design choices
- **Jurisdiction as a materialised path** (`/GJ/CIR-AMD/DIV-AMD/SUB-DAS/`) with a prefix index — "everything under my office" is one indexed `LIKE`, no recursive query per request.
- **Workflows are configuration**: state machines are `{from: {to: {roles, requires}}}` maps; work templates are rows. Invalid transitions return `409`.
- **One transaction per business event**: e.g. an inspection updates the asset, raises a request, recomputes risk and writes timeline + audit — or none of it happens.
- **Security**: role + jurisdiction enforced on the server for every endpoint; secrets only in the backend; RLS with no policies blocks Supabase's public Data API; uploads restricted by type/size and owner path.

## Scaling to the whole state

| Concern | Approach |
|---|---|
| API throughput | Stateless API behind a load balancer; horizontal scaling; JWT verification cached per token. |
| Large tables | Indexes on every filter column (type, org path, district, status, condition, risk, due dates, DLP), trigram search, **server-side pagination everywhere**. List of 500+ assets: ~70 ms. |
| Dashboards | One aggregate query per widget group (~0.4 s); cache in Redis with a short TTL; move heavy analytics to a read replica. |
| Batch work | Set-based jobs (bulk risk recompute: 524 assets in < 1 s with one `UPDATE … FROM jsonb_to_recordset`) run as BullMQ workers (nightly overdue scan, notifications, imports). |
| Files | Object storage with signed URLs; the database stores paths only. |
| Integrations | Adapter interface per external system (GRMS, IFMS, IWDMS, e-Procurement); mocks today, real adapters later without touching business logic. Shared IDs (asset code, work code) act as the reference layer — no copying other departments' data. |
| Evolution | Stay a modular monolith; extract GIS or jobs into services only when their scaling needs differ. |

---

## Run it

Prerequisites: Node 20+ (Node 20 needs `--experimental-websocket`, already in the scripts), a Supabase project.

1. `cp .env.example .env` and fill `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (Supabase → Connect → **Session pooler**).
2. Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public values only).
3. Install, build the database, start:

```bash
npm install
npm run migrate -w backend     # schema (6 migrations)
npm run seed -w backend        # deterministic demo data + demo logins
npm run dev                    # http://localhost:3000  ·  API http://localhost:4000/api/v1/health
```

| Script | Purpose |
|---|---|
| `npm run seed:production -w backend` | Configuration only (offices, asset types, templates, limits) — for a real installation |
| `npm run create-admin -w backend -- --email … --name "…"` | Create the first HQ administrator on a fresh installation |
| `npm run db:reset -w backend` | **Destructive (demo/dev only):** drops all GujInfra tables, removes smoke-test logins/photos, re-migrates and re-seeds |
| `npm run test:smoke -w backend` | ~200 API checks across M1–M6 and admin (backend must be running; creates "Smoke …" records — not on production) |
| `npm run build -w frontend` | Production build with type/lint validation |

### Demo accounts (password `GujInfra@2026`, one-click on the login page)

| Name | Role | Scope |
|---|---|---|
| Meera Desai | HQ — Chief Engineer | State |
| Suresh Joshi | HQ — Secretary | State |
| Rohit Parmar | EE | Ahmedabad Division |
| Kiran Solanki / Nisha Chauhan | AE | Daskroi / Sanand Sub-divisions |
| Vikram Rana / Pooja Mehta | EE / AE | Surat Division / Olpad |
| Harsh Vora / Dev Shah | Contractor | Aarav Infra Works / Kaveri Constructions |

### Demo data
500 assets across 12 districts (roads with chainage, bridges, culverts, buildings with equipment, streetlights), ~1,700 historical inspections, 61 maintenance requests in every state, 2 programmes and 21 works at every stage — including a bridge **ready for its handover gate**, a road **mid-construction**, and the hero bridge **RDB-BR-000001** with a complete timeline from government mandate (2023) to today.
The mid-construction road also carries a **measurement book** (8 BoQ items, 8 entries — one exceeding the BoQ, two awaiting checks — one paid and one approved RA bill); there are **5 citizen complaints** in every state (one unrouted, in the HQ queue) and a **past emergency** in Olpad for history.

Citizens report problems at **`/complain`** (no login) and track them at **`/complain/track`**.

---

## Project structure

```
backend/src      config · middleware (auth, rbac, validate, errors) · routes · controllers · services (engines)
backend/scripts  smoke-m1…m13 + smoke-admin API test suites
database/        migrations/*.sql · migrate.mjs · reset.mjs · seed/ (deterministic generators)
frontend/        app/ (pages) · components/ (ui kit, assets, works, dashboard) · lib/ (api, auth, toast) · types/
docs/            PRD, module notes, demo script
```

## Built vs roadmap
Built — all modules M0–M13: foundation, auth/RBAC/jurisdiction/audit, asset registry + Asset 360, inspections, maintenance workflow, full work journey, dashboards & risk, activity feed, administration, M7 GIS map, M8 documents, M9 contractors & DLP, M10 notifications & daily jobs, M11 measurement book & running bills, M12 emergency mode, M13 citizen complaints & integration adapters (CPGRAMS/SWAGAT inbound, PFMS bill export, GIS GeoJSON export).
Beyond the prototype: SMS/e-mail delivery of alerts, a dedicated worker for jobs at state scale, and real portal credentials for the adapters — see PRD §8.
