# GujInfra 360

**One digital identity and one lifecycle timeline for every road, bridge and government building** — from the government's decision to build, through survey, sanction, tender, construction and handover, to every inspection, repair, emergency, citizen complaint and contractor evaluation that follows.

Built for the Pravi Research *Build for Billions* hackathon. Positioned as an **asset-centric lifecycle and integration layer over existing systems** (GRMS, IWDMS, IFMS/PFMS, e-Procurement, CPGRAMS/SWAGAT), not a replacement. All data is fictitious.

## 🔗 Live demo

| | Link |
|---|---|
| **Web app** | **[pravi-frontend-cm4e.vercel.app](https://pravi-frontend-cm4e.vercel.app)** |
| Citizen complaint page (no login) | [/complain](https://pravi-frontend-cm4e.vercel.app/complain) |
| Track a complaint | [/complain/track](https://pravi-frontend-cm4e.vercel.app/complain/track) |
| API health | [gujinfra-api.onrender.com/api/v1/health](https://gujinfra-api.onrender.com/api/v1/health) |

Sign in with the one-click demo accounts on the login page (password for all: `GujInfra@2026`). The API runs on Render's free tier, so the first request after it has been idle can take ~30–50 s.

**Documentation:**
- [PRD](docs/PRD.md)
- [Module notes M0–M13](docs/modules/)
- [Step-by-step lifecycle walkthrough with values](docs/asset-lifecycle-walkthrough.md)
- [Demo script](docs/demo-script.md)
- [Full system walkthrough with edge cases](docs/system-walkthrough.md)
- [Handover & administration](docs/handover.md)

---

## What it does

| Area | Highlights |
|---|---|
| **Asset registry & Asset 360** | Config-driven asset types (attributes as a JSON schema), road segments with chainage, parent/child components, lookup by QR or asset code. Asset 360 answers *what is it, how did it come to exist, what happened to it, what condition is it in, what next*. It has tabs for timeline, components, inspections, maintenance, documents and complaints. |
| **Inspections** | Mobile-first form: 5-point condition rating, severity, quick-pick defects, camera photos (signed direct upload), live GPS with a distance-from-asset check. A rating ≤ 2 or HIGH severity **raises a repair automatically**. |
| **Maintenance workflow** | `OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED`, with a reject loop. An after-photo is required and the **verifier must be someone other than the person who did the work**. The asset status follows automatically, and **defects within the defect liability period (DLP) go to the original contractor**. |
| **Work journey** | Template-driven stages → tasks → gates (New Road, New Bridge, New Building, Repair, Emergency). Required deliverables; the gate evaluator must not have worked on the stage; **approval escalates by cost** (EE ≤ ₹2 Cr, HQ above); award with DLP; milestones can be returned for quality rework. **Handover creates the asset** with its entire pre-asset history, and closure produces an **explainable contractor evaluation**. Every work shows "Who has the file now". |
| **Measurement book & running bills** | Bill of quantities (BoQ) → measurements (nos × L × B × D) → **independent check** (never by the recorder) → running (RA) bill → **second-officer approval** → payment with a treasury reference. Quantities beyond the BoQ need a deviation note, the rate locks once measured, and **cumulative billing can never exceed the contract value**. |
| **Documents** | DPRs, drawings, contracts, as-built drawings, certificates and test reports on assets and works. Files go to private storage; an asset also shows its origin work's documents. Soft delete by permission. |
| **GIS map** | Leaflet with key-free Esri / OpenStreetMap tiles: clustered markers (cluster colour = worst risk inside), road segments as lines, colour by risk or condition, filters shared with the registry, "Locate me", deep link from Asset 360. |
| **Contractors & DLP** | DLP tracker: in DLP, ending soon, liable-defect queue, recently ended. Contractor performance: on-time %, delay, first-pass quality, DLP defects and fix time, closure scores. Contractors see only their own firm. |
| **Emergency mode** | Declare a flood, cyclone or structural failure for an area; everyone in it gets a critical alert and a red banner on every page. Report damaged assets: the asset **closes to traffic** and an **urgent repair is raised**. Fast-track emergency works, then restore assets and close the emergency. |
| **Citizen complaints** | A public page with no login: choose the problem, share GPS or describe the place, add photos. The complaint is **auto-matched to the nearest likely asset** (distance measured to the road line) and routed to that office; repeat reports are linked as duplicates. Officers acknowledge, re-link, take it up for repair, resolve or reject it. **Closing the repair resolves the complaint**, and the citizen follows every step with their complaint number and the last 4 digits of their phone. |
| **Integrations** | Inbound: CPGRAMS and SWAGAT grievances, protected by a shared key and idempotent on the grievance number. Outbound: PFMS-style export of an approved bill, and a GeoJSON asset layer for GIS portals. Every call is logged. |
| **Notifications & daily jobs** | A bell with system alerts plus hand-offs. A daily job recomputes risk and alerts about overdue inspections, late repairs (SLA), DLPs about to end and overdue tasks. Alerts are deduplicated, so re-runs are safe; HQ can run the job on demand. |
| **Risk & dashboards** | Explainable 0–100 risk score (condition, criticality, traffic, age, overdue inspection, repair history) with a "why?" breakdown and a suggested action. Role dashboards for HQ, EE, AE and contractors. |
| **Administration** | `/admin` for HQ: users, offices, asset types (form-field editor), approval limits, contractors, work templates, jobs & integrations, system health. Every change is audited. |
| **Accountability** | An append-only audit log and asset timeline (database triggers reject edits), and a per-user **Activity** feed showing who → whom → exact timestamp. |

**Roles (merged for the demo):**
- `HQ`: Admin + Secretary/CE + SE
- `EE`: EE + DEE
- `AE`
- `CONTRACTOR`

Jurisdiction follows State → Circle → Division → Sub-division.

---

## Architecture

```
 Next.js 15 (App Router, TS, Tailwind, Recharts, Leaflet) — role-aware UI, mobile-first field flows, public citizen pages
        │  REST /api/v1 · Supabase JWT (Bearer) · public routes rate-limited
        ▼
 Express API (stateless, modular monolith)
   routes → services → SQL
   middleware: auth (JWT verify + profile cache) · requireRole · jurisdiction scope · zod validation · rate limit · error envelope
   engines:    state machines (asset, maintenance) · stage/task/gate engine · risk engine · complaint matcher · daily job scheduler
        │
 ┌──────┴──────────────────────────┬──────────────────────────────┬──────────────────────────────┐
 ▼                                 ▼                              ▼                              ▼
 PostgreSQL (Supabase)          Supabase Storage               External systems               Scheduler
 RLS on, API is the only        private buckets: evidence,     CPGRAMS / SWAGAT (in),         in-process daily jobs;
 way in; append-only audit      documents; signed upload /     PFMS, GIS (out) via            a dedicated worker or
 + timeline triggers            download URLs                  logged adapters                platform cron at scale
```

**Key design choices:**
- **Jurisdiction as a materialised path** (`/GJ/CIR-AMD/DIV-AMD/SUB-DAS/`) with a prefix index. "Everything under my office" is one indexed `LIKE`, with no recursive query per request.
- **Workflows are configuration.** State machines are `{from: {to: {roles, requires}}}` maps, and work templates are rows. Invalid transitions return `409`.
- **One transaction per business event.** For example, a damage report closes the asset, raises a repair, recomputes risk and writes the timeline and audit — or none of it happens.
- **Separation of duties everywhere:**
  - the person who did the work cannot verify it
  - the gate evaluator must not have worked on the stage
  - the measurement checker is never the recorder
  - the bill approver is never the person who prepared it
- **Security:**
  - Role and jurisdiction are enforced on the server for every endpoint.
  - Secrets live only in the backend.
  - RLS with no policies blocks Supabase's public Data API.
  - Uploads are restricted by type, size and owner path.
  - Public endpoints are rate-limited and never return another citizen's personal data.

## Scaling to the whole state

| Concern | Approach |
|---|---|
| API throughput | Stateless API behind a load balancer; horizontal scaling; JWT verification cached per token. |
| Large tables | Indexes on every filter column, **server-side pagination everywhere**. Listing 500+ assets takes ~70 ms. |
| Dashboards | One aggregate query per widget group (~0.4 s); cache in Redis with a short TTL; move heavy analytics to a read replica. |
| Batch work | Set-based jobs (bulk risk recompute: 500+ assets in < 1 s with one `UPDATE … FROM jsonb_to_recordset`). The in-process scheduler moves to a worker or platform cron (`DISABLE_SCHEDULER=true`). |
| Files | Object storage with signed URLs; the database stores paths only. |
| Integrations | One adapter per external system, logged and idempotent. Shared IDs (asset code, work code, complaint number) act as the reference layer — no copying other departments' data. |

---

## Run it locally

Prerequisites: Node 20+ (Node 20 needs `--experimental-websocket`, which the scripts already pass) and a Supabase project.

1. Run `cp .env.example .env` and fill in `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `DATABASE_URL` (Supabase → Connect → **Session pooler**).
2. Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public values only — never the secret key).
3. Install, build the database and start:

```bash
npm install
npm run migrate -w backend     # schema (12 migrations)
npm run seed -w backend        # deterministic demo data + demo logins
npm run dev                    # http://localhost:3000  ·  API http://localhost:4000/api/v1/health
```

| Script | Purpose |
|---|---|
| `npm run seed:production -w backend` | Configuration only (offices, asset types, templates, limits) — for a real installation |
| `npm run create-admin -w backend -- --email … --name "…"` | Creates the first HQ administrator on a fresh installation |
| `npm run db:reset -w backend` | **Destructive (demo/dev only):** drops all GujInfra tables, empties the storage buckets, removes smoke-test logins, then re-migrates and re-seeds |
| `npm run test:smoke -w backend` | ~360 API checks across M1–M13 and admin. The backend must be running. It creates "Smoke …" records, so don't run it against production. |
| `npm run build -w frontend` | Production build with type validation |

### Environment variables

| Where | Variable | Notes |
|---|---|---|
| Backend (`.env` / Render) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` | Required. The secret key stays on the server only. |
| | `CORS_ORIGIN` | Comma-separated list, e.g. `https://pravi-frontend-cm4e.vercel.app,http://localhost:3000` |
| | `INTEGRATION_API_KEY` | Optional. Enables the CPGRAMS/SWAGAT inbound adapters (without it they answer 503). |
| | `DISABLE_SCHEDULER` | Optional. Set `true` when a platform cron calls `POST /api/v1/admin/jobs/daily/run` instead. |
| Frontend (`frontend/.env.local` / Vercel) | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public values only. |

### Deployment
- **Frontend → Vercel:** root directory `frontend`, with the three `NEXT_PUBLIC_*` variables set.
- **Backend → Render:** uses [`render.yaml`](render.yaml). The build runs `npm ci -w backend && npm run migrate -w backend`, so new migrations apply automatically. It starts with `npm run start -w backend`, and the health check is `/api/v1/health`.

Pushing to GitHub redeploys both.

### Demo accounts (password `GujInfra@2026`, one click on the login page)

| Name | Role | Scope |
|---|---|---|
| Meera Desai | HQ — Chief Engineer | State |
| Suresh Joshi | HQ — Secretary | State (second officer for independent gates) |
| Rohit Parmar | EE | Ahmedabad Division |
| Kiran Solanki / Nisha Chauhan | AE | Daskroi / Sanand Sub-divisions |
| Vikram Rana / Pooja Mehta | EE / AE | Surat Division / Olpad |
| Harsh Vora / Dev Shah | Contractor | Aarav Infra Works / Kaveri Constructions |

### Demo data
- **Assets:** 500 across 12 districts (roads with chainage, bridges, culverts, buildings with equipment, streetlights).
- **Inspections and repairs:** ~1,700 historical inspections and 61 maintenance requests covering every status.
- **Programmes and works:** 2 programmes and 21 works at every stage, including:
  - a bridge **ready for its handover gate**
  - a road **mid-construction**
  - the hero bridge **RDB-BR-000001**, with a complete timeline from the government mandate (2023) to today
- **Documents:** 17 seeded PDFs (DPR, drawings, contract, certificates…).
- **Measurement book:** on the mid-construction Sanand–Dholka road — 8 BoQ items and 8 entries (one exceeding the BoQ, two awaiting checks), one paid RA bill and one approved.
- **Complaints:** 5 citizen complaints in different states, one unrouted in the HQ queue.
- **Emergencies:** one past (closed) emergency in Olpad.

---

## Project structure

```
backend/src
  config/        env, Postgres pool, Supabase admin client
  middleware/    auth · rbac · validate (zod) · rate limit · logger · error envelope
  routes/        health · public (citizens, portals) · core · assets · inspections · maintenance · works · dashboard
                 admin · contractors · documents · notifications · measurement · emergencies · complaints
  services/      business logic + engines (workflow, risk, jobs, complaint matching, integrations, storage)
backend/scripts  smoke-m1…m13 + smoke-admin API test suites
database/        migrations/001–012 · migrate.mjs · reset.mjs · create-admin.mjs · seed/01–08 (deterministic generators)
frontend/app     dashboard · assets · map · inspections · maintenance · complaints · emergencies · works (+ /mb)
                 programmes · tasks · dlp · contractors · activity · audit · admin · login · complain (public)
frontend/components  ui kit · layout (shell, bell, emergency banner) · assets · works · maintenance · map
                     dashboard · documents · complaints · admin · public
docs/            PRD · module notes M0–M13 · walkthroughs · demo script · handover
postman/         API collection
```

## Modules

| Module | Status |
|---|---|
| M0 Foundation · M1 Auth, RBAC, jurisdiction, audit · M2 Assets & Asset 360 · M3 Inspections | ✅ Built |
| M4 Maintenance workflow · M5 Work journey · M6 Dashboards & risk | ✅ Built |
| M7 GIS map · M8 Documents · M9 Contractors & DLP | ✅ Built |
| M10 Notifications & daily jobs · M11 Measurement book & running bills | ✅ Built |
| M12 Emergency mode · M13 Citizen complaints & integration adapters | ✅ Built |

**Beyond the prototype:** SMS / e-mail / WhatsApp delivery of alerts, a dedicated job worker at state scale, real portal credentials for the adapters, and an offline mode for field inspections — see PRD §8.
