# PRD — Gujarat R&B Infrastructure Asset Lifecycle Management System

**Working name:** GujInfra 360 (rename freely)
**Client context:** Roads & Buildings Department, Government of Gujarat
**Built for:** Pravi Research "Build for Billions" hackathon (Associate – Tech recruitment)
**Document status:** v1.1 — living document. Update the "Decisions log" (Section 21) whenever scope changes.

---

## 0. How to use this document (read first, Claude Code)

This PRD is the single source of truth for what we are building. We build **one module at a time**, in the order given in Section 16, and we do **not** start module N+1 until module N passes its Definition of Done (DoD).

**Working agreement**

1. Read this whole file, then `HACKATHON_CONTEXT.md`, before writing code.
2. Work on **one module per session**. State which module you are building and list the files you will touch before touching them.
3. Reuse the existing boilerplate folder structure (`frontend/`, `backend/`, `database/`, `docs/`). Do not restructure it. Do not regenerate the skeleton.
4. Make **surgical, incremental changes**. Never rewrite an existing file wholesale unless asked.
5. Stack is fixed (Section 12). Ask before adding any new dependency.
6. Every state-changing action must write an `audit_logs` row and, where the asset is involved, a `lifecycle_events` row (Section 10.2). This is cross-cutting, not optional.
7. Every list endpoint is paginated. Every frequently-filtered column is indexed.
8. Every screen needs loading, empty, and error states.
9. After finishing a module: run its DoD checklist, report what passed and what did not, and stop. Do not continue to the next module without a go-ahead.
10. If something in this PRD is ambiguous or contradicts the code, flag it — do not silently pick.
11. Sample data is clearly fake. Never use real road numbers, real contractor names, or real people.

**Tiers** (the full vision is bigger than one hackathon; build in tier order)

| Tier | Meaning | Modules |
|---|---|---|
| **A — Demo core** | Must work end to end. This is what gets judged. | M0–M6 |
| **B — Impact layer** | Adds the "wow" and the R&B-specific credibility. | M7–M9 |
| **C — Vision** | Explain in the pitch; build only if time remains. | M10–M13 |

---

## 1. Overview

### 1.1 One-line vision
One digital identity for every physical infrastructure asset (road, bridge, building), connected to every work, document, inspection, expenditure, maintenance event, and responsible person across its whole lifecycle.

### 1.2 The core idea
The challenge is **not** to build an inventory of roads and buildings. It is to build a **single lifecycle record** that connects an asset from *"why are we building/repairing this?"* through planning → approval → tender → construction → measurement/payment → handover → operation → inspection → maintenance → rehabilitation → retirement — and then turns that record into **decisions** (what to inspect, what to repair, where to spend).

### 1.3 The five questions every asset page must answer
1. **What is it?** Identity, type, location, components.
2. **How did it come into existence?** Work, estimate, contractor, cost, approvals.
3. **What has happened to it?** Inspections, repairs, complaints, incidents.
4. **What condition is it in now?** Condition, risk, open defects, last inspection.
5. **What should happen next?** Recommended inspection / maintenance / rehabilitation, with the reason.

---

## 2. Problem statement

Government infrastructure assets are long-lived, geographically spread, and managed by many engineering, administrative, financial, and field stakeholders. Information about one asset is generated at different stages and in different systems. Consequences:

| # | Problem | Effect |
|---|---|---|
| 1 | **Fragmented information** — work, finance, GIS, inspection, documents, contracts live in separate systems | Officials cannot ask "show me everything about this bridge" |
| 2 | **Fragmented asset history** — construction, repair, inspection, maintenance are not one timeline | Past decisions and repairs are invisible to planners |
| 3 | **Field-to-office gap** — field observations are re-entered manually | Delay, errors, lost evidence |
| 4 | **No asset-centric visibility** | Users must know *which application* holds the data before they can look |
| 5 | **Reactive maintenance** | Repairs happen after failure or complaint, not by condition and risk |
| 6 | **Weak accountability** | Hard to answer who did what, when, where, with what evidence |
| 7 | **Lifecycle discontinuity** | *Project completed → asset forgotten.* Should be *project completed → asset created → asset continuously managed* |

The official-style organisation context: R&B plans, builds, and maintains roads, bridges, and government-owned buildings; executes deposit works for other bodies; and is organised geographically into circles, divisions, and sub-divisions.

---

## 3. Positioning (important — say this in the pitch)

Gujarat already has digital systems in this space (as per the research provided: GRMS / GujRAMS for road management, a Works Monitoring System, Road Mitra, IWDMS, IFMS, e-Procurement, and a documented need to integrate them via a common platform / API layer).

**Therefore we do NOT claim "Gujarat has no asset inventory" and we do NOT propose replacing existing systems.**

We propose an **asset-centric lifecycle and integration layer**: a unified digital thread over existing systems and field operations, adding what is missing — a single asset identity, a continuous lifecycle timeline, field capture, workflow with accountability, and explainable risk-based prioritisation.

```
Existing systems (GRMS, IWDMS, IFMS, e-Procurement, Road Mitra, ...)
                      │  API / adapters
                      ▼
            ┌──────────────────────┐
            │  ASSET 360 PLATFORM  │  ← what we build
            └──────────┬───────────┘
   Registry · GIS · Work lifecycle · Inspections · Maintenance
   Documents · Contractors · Risk & decision support · Audit
```

**In the MVP, integrations are mocked behind adapter interfaces** (Section 12.4) — we demonstrate the pattern without pretending to connect to real government systems.

---

## 4. Goals, non-goals, success metrics

### 4.1 Goals
- G1. Every asset has one identity and one lifecycle timeline.
- G2. A completed work automatically creates (or updates) its asset — closing the "project → asset" gap.
- G3. Field engineers can record an inspection in under a minute on a phone, with GPS and photo evidence.
- G4. Inspections drive maintenance: a poor inspection automatically raises a maintenance request that is tracked to verified closure.
- G5. Leaders see prioritised, explainable lists ("these 10 assets need attention first, and here is why").
- G6. Every action is attributable (who, when, where, what changed, what evidence).
- G7. The design is credible at state scale (pagination, indexes, caching, stateless API, async jobs).
- G8. Every work follows an end-to-end, template-driven journey — from a government mandate through survey, design, approvals, tender, construction, handover, and contractor closure — where each stage has assigned tasks, required evidence, and a recorded evaluation (Section 7.5).

### 4.2 Non-goals (do not build)
- Replacing GRMS, IFMS, IWDMS, e-Procurement, or building a full tender/eProcurement system.
- Full billing/payment processing (we show measurement → verified quantity traceability only).
- Real government integrations or real Aadhaar/eSign.
- Automatic authorisation of expenditure by AI. **AI/analytics only assist prioritisation; the responsible officer decides.**
- Native mobile apps (we ship a mobile-first responsive web app / PWA).
- Kubernetes, Kafka, microservices split.

### 4.3 Success metrics (for the demo and the pitch)
| Metric | Target |
|---|---|
| Asset lookup to full Asset 360 view | ≤ 2 clicks / < 1 s on seeded data |
| Field inspection submission | ≤ 60 s, ≤ 5 taps after opening asset |
| Poor inspection → maintenance request | Automatic, 0 manual steps |
| Asset list API on 100k seeded rows | p95 < 300 ms (indexed + paginated) |
| Traceability | 100% of state changes appear in the asset timeline |

---

## 5. Users, roles, and jurisdiction

### 5.1 Stakeholder map (who we design for)
| Stakeholder | What they need |
|---|---|
| Secretary / HQ | State-wide overview, critical assets, budget vs need |
| Chief Engineer | Strategic monitoring, high-risk infrastructure, backlog |
| Superintending Engineer (Circle) | Circle-level performance and condition |
| Executive Engineer (Division) | Division assets, active works, approvals, contractors |
| Deputy Executive Engineer (Sub-division) | Field execution, assignments, verification |
| Assistant Engineer / field staff | Inspections, measurements, issues, photos |
| Contractor | Own contracts, progress, defects, DLP obligations |
| Quality / Electrical / Mechanical wings | Tests, specialised assets *(P2)* |
| Finance / Procurement / Audit | Traceability, expenditure view *(read-only, P2)* |
| Citizens | Report an issue, see status *(P2)* |

### 5.2 Roles implemented in the app
`ADMIN`, `HQ_OFFICIAL` (Secretary / Chief Engineer), `CIRCLE_SE`, `DIVISION_EE`, `SUBDIVISION_DEE`, `FIELD_AE`, `CONTRACTOR`, `CITIZEN` (Tier C).

> Titles are the standard PWD-style hierarchy; **confirm exact designations with the evaluators** and adjust labels only (logic stays the same).

> **Hackathon build — merged roles (see decisions log).** To keep the demo showable, the app implements **4 roles** that map onto the matrix below:
> | App role | Covers | Scope |
> |---|---|---|
> | `HQ` | ADMIN + HQ_OFFICIAL + CIRCLE_SE | State (everything) |
> | `EE` | DIVISION_EE + SUBDIVISION_DEE | Own division subtree |
> | `AE` | FIELD_AE | Own sub-division |
> | `CONTRACTOR` | CONTRACTOR | Own contracts only |
> The org hierarchy keeps all four levels (state → circle → division → sub-division); only the number of distinct permission sets shrinks. Splitting them back is a role-config change, not a schema change. `designation` on the user still shows the real title (e.g. "Superintending Engineer").

### 5.3 Jurisdiction hierarchy (drives routing and visibility)
```
STATE (HQ)
  └── CIRCLE          (Superintending Engineer)
        └── DIVISION      (Executive Engineer)
              └── SUB-DIVISION  (Deputy Executive Engineer)
                    └── Section / field staff (Assistant Engineer)
```
Every **user** belongs to one org unit. Every **asset** belongs to one sub-division (and therefore one division, circle). Stored in a single `org_units` table with `type` and `parent_id`.

**Visibility rule:** a user sees all data in their org unit's **subtree**. HQ sees everything. A contractor sees only works/assets/requests tied to their own contracts. Citizens see only the public view.

### 5.4 Permission matrix
Legend: ✔ allowed · ◐ within own jurisdiction only · own = only own records · — not allowed

| Capability | ADMIN | HQ | CIRCLE_SE | DIVISION_EE | SUBDIV_DEE | FIELD_AE | CONTRACTOR |
|---|---|---|---|---|---|---|---|
| Manage users / org units / asset types | ✔ | — | — | — | — | — | — |
| View assets | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ | own |
| Create / edit asset | ✔ | — | — | ◐ | ◐ | ◐ (limited) | — |
| Change asset lifecycle status | ✔ | — | ◐ | ◐ | ◐ | — | — |
| Create work proposal | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ | — |
| Define programme / issue government directive | ✔ | ✔ | ◐ (own circle) | — | — | — | — |
| Assign stage tasks | ✔ | ✔ (state-level) | ◐ | ◐ | ◐ | — | — |
| Complete / submit an assigned task | — | ✔ | ◐ | ◐ | ◐ | ◐ | own |
| Evaluate stage (pass / return / reject at a gate) | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ (site-level checks) | — |
| Evaluate contractor (closure performance) | ✔ | — | ◐ | ◐ | — | — | — |
| Approve / sanction work | ✔ | ✔ | ◐ by cost | ◐ by cost | ◐ by cost | — | — |
| Record work progress | — | — | — | ◐ | ◐ | ◐ | own |
| Submit inspection | — | — | — | ◐ | ◐ | ◐ | — |
| Review inspection | — | — | ◐ | ◐ | ◐ | — | — |
| Create maintenance request | ✔ | — | ◐ | ◐ | ◐ | ◐ | — |
| Assign maintenance | ✔ | — | ◐ | ◐ | ◐ | — | — |
| Update maintenance progress | — | — | — | ◐ | ◐ | ◐ | own |
| Verify maintenance | — | — | ◐ | ◐ | ◐ | ◐ (own inspection scope) | — |
| Upload documents | ✔ | — | ◐ | ◐ | ◐ | ◐ | own |
| View dashboards | ✔ | ✔ (state) | ✔ (circle) | ✔ (division) | ✔ (sub-div) | ✔ (my work) | ✔ (my contracts) |
| View audit log | ✔ | ✔ | ◐ | ◐ | — | — | — |

Enforce on the **backend** (middleware `requireRole` + `applyJurisdictionScope`). Hiding buttons in the UI is not security.

**Approval by cost (configurable, `approval_limits` table).** Larger works escalate to higher roles. Seed **illustrative** limits only (e.g., Sub-division up to X, Division up to Y, Circle up to Z, above → HQ). State clearly in the demo that thresholds are configurable and not the department's actual delegation of powers.

---

## 6. Core concepts

### 6.1 Work vs Asset (critical distinction)
A **Work** (project) is an activity with a start, end, cost, and contractor. An **Asset** is a physical thing that lives on after the work. Example: *"Ahmedabad–Mehsana Road Improvement"* is a **work**; the 42 km road, 3 bridges, 17 culverts, signs, drainage, and streetlights it creates or modifies are **assets**.

```
WORK ──creates/modifies──► ASSET(s)
 └── contractor, cost, approvals, measurement, DLP
```
Relationship table `work_assets(work_id, asset_id, role)` with `role ∈ {CREATED, TARGET}`.

### 6.2 Asset hierarchy
Assets can have a parent (`parent_id`) to model components:
```
Road asset (segment)
 ├── Pavement · Shoulder · Drainage · Signage · Road furniture
Bridge asset
 ├── Deck · Bearings · Expansion joint · Foundation
Building asset
 ├── Floor → Room → Equipment (lift, AC, UPS, fire system)
```
Health and risk can **roll up** from children to parent (a failed lift lowers the building's health).

### 6.3 Roads are segments with chainage
Do not model "one record per road". Model **segments**: `road_code`, `start_chainage_km`, `end_chainage_km`, optional GeoJSON line. Condition and maintenance are decided per segment. Example: `GJ-SH-08 · 42.650–45.000 km · Left carriageway · Pavement failure · High`.

### 6.4 Asset types are configuration, not code
`asset_types` defines category, attribute schema (JSON), inspection interval, and design life. `assets.attributes` (JSONB) stores type-specific values. Adding streetlights or water pumps = a config row, not a code change.

### 6.5 Asset 360
The single page that aggregates identity, location, origin work, contractor/DLP, documents, inspection history, condition trend, maintenance history, complaints, risk (with explanation), and responsible people, plus the lifecycle timeline.

### 6.6 Lifecycle events (immutable history)
Append-only `lifecycle_events` table. Every meaningful change writes one row. This *is* the asset timeline.

---

## 7. Lifecycles and state machines

Implement transitions in **one service layer** (`workflowService`) driven by a config map `{from → [{to, allowedRoles, requires}]}`. Never scatter `if (status === ...)` checks through controllers. Invalid transitions return `409` with a clear message.

### 7.1 Asset lifecycle status
`PLANNED → UNDER_CONSTRUCTION → OPERATIONAL ⇄ UNDER_MAINTENANCE / UNDER_REHABILITATION / CLOSED_TEMPORARILY → RETIRED`

| From | To | Who | Trigger / rule |
|---|---|---|---|
| — | PLANNED | Officer | Optional placeholder created with a work proposal |
| PLANNED | UNDER_CONSTRUCTION | System | Work reaches the Construction stage (`IN_PROGRESS`, see 7.5) |
| UNDER_CONSTRUCTION | OPERATIONAL | System / EE | Work `HANDED_OVER` (asset created or activated) |
| OPERATIONAL | UNDER_MAINTENANCE | System | Maintenance request `IN_PROGRESS` on this asset |
| UNDER_MAINTENANCE | OPERATIONAL | System | Maintenance `VERIFIED` |
| OPERATIONAL | UNDER_REHABILITATION | EE+ | Rehab work `IN_PROGRESS` |
| OPERATIONAL | CLOSED_TEMPORARILY | EE+ | Emergency / unsafe; requires remarks |
| any active | RETIRED | EE + approver (SE/HQ by cost) | Requires reason, remarks; asset becomes read-only |

**Defect Liability Period (DLP) is a derived flag, not a status:** `in_dlp = today ≤ dlp_end_date`.

### 7.2 Work lifecycle
`DRAFT → PROPOSED → TECHNICALLY_SANCTIONED → ADMIN_APPROVED → TENDERED → AWARDED → IN_PROGRESS → COMPLETED → HANDED_OVER → CLOSED`
Side states: `REJECTED`, `ON_HOLD`, `CANCELLED`.

| Transition | Who | Rule |
|---|---|---|
| DRAFT → PROPOSED | Creator | Needs linked asset(s), estimate, justification |
| PROPOSED → TECHNICALLY_SANCTIONED | Engineer with sufficient cost limit | Records approver + remarks |
| → ADMIN_APPROVED | Approver by cost limit | Records sanctioned amount |
| → TENDERED | DEE / EE | Stores external `tender_ref` (no procurement logic) |
| → AWARDED | DEE / EE | Requires contractor, contract value, start, planned end, `dlp_months` |
| → IN_PROGRESS | System / EE | First progress report or start date |
| → COMPLETED | Contractor or AE reports; EE confirms | Progress = 100%, final inspection recorded |
| → HANDED_OVER | EE | **Creates/activates asset(s); sets `dlp_end_date`; writes lifecycle events** |
| → CLOSED | EE | After financial/document closure (DLP tracked separately) |
Any state → `REJECTED` / `ON_HOLD` needs remarks. Every approval writes `work_approvals`.

> **Note:** these statuses are the coarse summary of a work. The detailed, task-level journey (who is assigned what, what evidence is required, who evaluates each stage) is defined in **7.5**, and `works.status` is derived from the current stage.

### 7.3 Inspection
`SCHEDULED → SUBMITTED → REVIEWED` (MVP may collapse to `SUBMITTED → REVIEWED`).
**Automatic rules on submit:**
1. Update `assets.condition_rating`, `last_inspected_at`, `next_inspection_due = inspected_at + type.inspection_interval_days`.
2. If `condition_rating ≤ 2` **or** `severity = HIGH` → auto-create a `maintenance_request` (status `OPEN`, source `INSPECTION`).
3. Recompute risk score (Section 9).
4. Write lifecycle event + audit log; notify the responsible officer.

### 7.4 Maintenance request
`OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED`
Side: `REJECTED_VERIFICATION` (back to `IN_PROGRESS`), `CANCELLED`.

| Transition | Who | Rule |
|---|---|---|
| OPEN → ASSIGNED | DEE/EE | Sets `assigned_to` (AE or contractor) and `due_date` |
| ASSIGNED → IN_PROGRESS | Assignee | Sets asset `UNDER_MAINTENANCE` |
| IN_PROGRESS → COMPLETED | Assignee | Requires after-photo + remarks |
| COMPLETED → VERIFIED | Inspector/AE (not the same person who did the work) | Requires new condition rating; updates asset; asset back to `OPERATIONAL` |
| VERIFIED → CLOSED | System / EE | Records `actual_cost` |
**DLP rule:** if the asset is in DLP when the request is created, set `dlp_liable = true`, prefill the original contractor, and notify them ("this repair is under your liability").
**Escalation:** if `due_date` passes and status < `COMPLETED`, flag `OVERDUE` and surface to the next role up.

### 7.5 End-to-end work journey (stage → task → evaluation)

This is the backbone for creating **any new asset from zero** (e.g., a new road) and for repair/rehab works. It runs from the government's decision to build, down to the contractor's final evaluation, and then hands the asset over to the operations lifecycle (7.1, 7.3, 7.4).

#### 7.5.1 Principle
- A work follows a **work template** (config, not code). A template = ordered **stages**; each stage has **tasks** and a **gate**.
- **Task:** assigned to a named person (`assigned_to`, `assigned_by`, `due_date`), with required deliverables (documents, photos, forms). Statuses: `PENDING → IN_PROGRESS → SUBMITTED → ACCEPTED` (or `RETURNED` for rework, `OVERDUE`, `SKIPPED` with remarks).
- **Gate (stage evaluation):** a designated reviewer evaluates the stage against a checklist and records `PASSED`, `PASSED_WITH_OBSERVATIONS`, `RETURNED` (back to the stage for rework, remarks mandatory), or `REJECTED`. **Evaluator ≠ the person who did the task.**
- The next stage unlocks only when all mandatory tasks are `ACCEPTED`, mandatory deliverables are attached, and the gate is passed. Skipping a task needs a higher role and remarks.
- Everything is recorded: who assigned, who did, who evaluated, evidence, planned vs actual dates. Stage timing feeds delay analytics ("stage aging", "who has the file now").
- Templates are seeded for: **New Road** (built out in full), New Bridge, New Building, Repair/Rehabilitation, Emergency (fast-track). Only New Road needs full task detail for the demo; the others can be short config rows.

#### 7.5.2 Initiation — top-down and bottom-up
A work can start from:
| Source | Example | Initiated by |
|---|---|---|
| **Government programme / budget head** | "State highway improvement programme 2026-27" with an allocation and targets | HQ (Secretary / Chief Engineer) |
| **Directive / decision** | Minister or Secretary instruction, request from another department (deposit work), local-body request | HQ / Circle |
| **Field need** | Inspection finding, periodic renewal cycle | Division / Sub-division |
| **Citizen complaint** *(Tier C)* | Road blocked, repeated potholes | Any officer |
| **Emergency** | Flood or cyclone damage | Division / Circle |
Initiation records: reference/order number and date, objective, priority, budget head, target period, responsible Division/Circle. A `programme` groups many works and tracks allocated vs sanctioned vs spent (view only).

#### 7.5.3 The journey of a new road (default template `NEW_ROAD`)
Durations and checklists are illustrative and configurable.

| Stage | Key tasks | Assigned to | Required deliverables / evidence | Gate evaluated by | Gate checks (examples) |
|---|---|---|---|---|---|
| **0. Initiation & mandate** | Record need, objective, priority, indicative budget, target dates; assign responsible Division | HQ / Circle SE | Order/directive reference, initiation note | HQ / Chief Engineer | Aligned to a programme or directive; responsible Division assigned |
| **1. Survey & investigation** | Reconnaissance, alignment options, topographic / traffic / soil survey, utilities, land and environmental/social screening | DEE → AE, consultant | Survey report, alignment map, photos, traffic counts | EE (SE for major works) | Survey complete; alignment chosen with justification |
| **2. Design & estimate (DPR)** | Drawings, specifications, Bill of Quantities, cost estimate, schedule | DEE / design cell / consultant | Drawings, BoQ, estimate, schedule | EE / SE (technical review) | Design meets specs; estimate reconciles with BoQ |
| **3. Approvals & clearances** | Technical sanction, administrative approval, budget allocation; land, utility, environmental clearances | Approver by cost limit | Sanction orders, clearance documents | Approving authority | Sanctions recorded; clearances attached |
| **4. Tender & award** | Record external tender reference, evaluation outcome, contractor selection; contract details (value, period, **DLP months**) | EE / DEE | Tender ref, agreement, work order | Award authority | Contract complete; contractor linked to the work |
| **5. Mobilisation & construction** | Contractor submits work programme and milestones (e.g., earthwork, sub-base, base, surfacing, drainage, markings, signage); site supervision; measurements; quality tests; site instructions; hindrances | Contractor (execution), AE/DEE (supervision) | Progress photos with GPS, test results, measurement records, site instructions | AE / DEE per milestone; EE for stage | Each milestone passes quality check (else `RETURNED` for rework); delays flagged |
| **6. Completion & handover** | Completion request, joint final inspection, punch-list rectification, as-built drawings, completion certificate, final measurement | Contractor, AE/DEE | Completion certificate, as-built drawings, final inspection report | EE (SE for major) | Punch list cleared; documents complete → **assets created/activated, DLP starts** |
| **7. DLP & closure** | Track DLP, handle defects (contractor-liable), joint end-of-DLP inspection, record security/retention release reference (external), **evaluate contractor**, close work | EE / DEE | End-of-DLP report, contractor evaluation | EE evaluates; SE reviews | Defects rectified; evaluation recorded → work `CLOSED` |

After Stage 7 the asset simply continues in operation (inspection → maintenance → rehab → retirement) on the **same asset record**.

**Asset identity from the start:** when a work passes Stage 2, create the asset(s) as `PLANNED` so drawings, surveys, and documents attach to an asset identity early; handover (Stage 6) activates them. All stage events are visible on the asset's timeline via `origin_work_id`.

**Other templates (config summaries)**
- **New Bridge:** as New Road plus structural design vetting, foundation / substructure / superstructure milestones, load test before commissioning.
- **New Building:** architectural/structural/electrical/fire drawings, floor-wise milestones, service clearances, handover with equipment registered as **child assets** (lifts, AC, fire systems).
- **Repair / Rehab / Maintenance work:** short path — need → estimate → approval → assign/award → execute → verify → close.
- **Emergency:** fast-track — immediate action and temporary measure → estimate and approval recorded after the fact → repair → close.

#### 7.5.4 Rules
- Stages are sequential; tasks within a stage can run in parallel. Each stage has a planned duration; exceeding it flags the stage as delayed.
- A returned gate sends the stage back to `ACTIVE` with the evaluator's remarks; affected tasks become `RETURNED`.
- Every task/stage change writes `audit_logs` and, where an asset exists, `lifecycle_events`.
- **"Who has the file now" view:** current stage, pending task, assignee, days in stage, next gate reviewer.
- Cost-based approval limits (5.4) apply at Stage 3 and at any gate that commits money.

#### 7.5.5 Contractor evaluation (at Stage 7)
Illustrative weights, configurable; each component shows its inputs so the score is explainable.
| Component | Weight | Source |
|---|---|---|
| Schedule adherence | 30 | Planned vs actual dates, delayed milestones |
| Quality (first-pass rate) | 30 | Milestone gates passed without rework |
| Rework / construction defects | 15 | Returned tasks, punch-list size |
| Defects during DLP | 15 | DLP-liable requests raised and their closure time |
| Documentation completeness | 10 | As-built, certificates, test records attached |
Total (0–100) is stored in `contractor_evaluations` and shown in the contractor performance view (M9). It supports decisions; it does not automatically debar or penalise anyone.

---

## 8. Modules — requirements and acceptance criteria

Format: **Priority** (P0 must / P1 should / P2 could) · **Tier** · requirements · **DoD** (acceptance criteria to check before moving on).

### M0 — Foundation *(Tier A, P0)*
- Repo boots: `frontend` (Next.js + TS + Tailwind, light theme), `backend` (Express), DB connected (Supabase Postgres), `.env` loaded.
- Backend layering: routes → controllers → services → models; `errorHandler`, request `logger`, standard response envelope, `/api/v1/health`.
- Shared UI kit: Button, Input, Select, Modal, Table (with pagination), StatusBadge, Card, Sidebar, Navbar, Loading, EmptyState, ErrorState.
- Migrations folder + first migration runner; seed script skeleton.
- **DoD:** `GET /api/v1/health` returns OK; frontend shows a layout shell; a DB round-trip works; lint/type-check passes.

### M1 — Auth, roles, jurisdiction, audit *(Tier A, P0)*
- Supabase Auth login; backend verifies JWT; `users` table holds role + `org_unit_id`.
- `requireRole(...)` and `applyJurisdictionScope(query, user)` helpers used by every data endpoint.
- Role-aware app shell (sidebar items differ per role).
- `audit_logs` helper `audit(user, action, entity, id, diff)` and `lifecycle_events` helper.
- Seeded demo users: one per role (fake).
- **DoD:** each role can log in and sees the correct nav; a FIELD_AE in Division A **cannot** fetch Division B data (verified via API, not just UI); an audit row exists for login-independent write actions.

### M2 — Asset registry & Asset 360 *(Tier A, P0)*
- CRUD assets with type-driven dynamic form (from `asset_types.attribute_schema`); parent/child components; road segments with chainage.
- Search, filters (type, district, division, status, condition, risk band), sort, **server-side pagination**.
- **Asset 360 page:** identity · location · origin work · DLP badge · condition + trend · risk with explanation · components tree · tabs (Timeline, Inspections, Maintenance, Documents, Complaints) · responsible people.
- Unique human-readable `asset_code` (e.g. `RDB-BR-000123`) + `qr_token`.
- **DoD:** create a bridge, a road segment, and a building with 2 child equipment assets; filter/search works; Asset 360 renders all tabs (empty states OK); every create/edit appears in Timeline; list API is paginated and indexed.

### M3 — Inspections & condition *(Tier A, P0)*
- Mobile-first inspection form: asset (search **or QR/asset-code lookup**), inspection type, condition (5-point), severity, defect list, remarks, recommendation, photos, **auto GPS**.
- Submit applies the automatic rules in 7.3.
- Condition history chart per asset; "Overdue inspections" list.
- **DoD:** submitting rating 2 auto-creates a maintenance request; rating 4 does not; asset condition, last-inspected, next-due, and risk all update; timeline shows the event; works at 390 px width.

### M4 — Maintenance workflow *(Tier A, P0)*
- Board/list of requests with filters; detail page; assign, start, complete (after-photo), verify (new rating), close (actual cost).
- Enforce role rules, "verifier ≠ doer", DLP-liability flag, overdue flag.
- Asset status changes automatically (7.1).
- **DoD:** run the full chain OPEN → CLOSED as different users; invalid transitions rejected with `409`; asset returns to `OPERATIONAL` with the new condition; complete history visible in Asset 360.

### M5a — Work initiation & stage engine *(Tier A, P0)*
- **Programmes:** create a programme (name, financial year, budget head, allocated amount, owner unit); list works under it.
- **Initiate a work** from a programme, directive, field need, or emergency, with reference/order number, objective, priority, target period, responsible Division; link target asset(s) or create `PLANNED` asset placeholders.
- **Template engine (config-driven):** seed `NEW_ROAD` in full, plus `NEW_BRIDGE`, `NEW_BUILDING`, `REPAIR_REHAB`, `EMERGENCY`. On work creation, instantiate `work_stages` and `work_tasks` from the template.
- **Tasks:** assign to a user with due date; "My tasks" inbox; submit with required deliverables; accept or return; overdue flag and escalation.
- **Gates:** evaluation screen with checklist and outcome (passed / observations / returned / rejected); evaluator ≠ doer; remarks required on return/reject.
- **Approvals at Stage 3** with cost-based escalation (`approval_limits`), `work_approvals` log.
- **Tender & award (Stage 4):** external `tender_ref`, contractor, contract value, dates, `dlp_months` (no procurement logic).
- **"Who has the file now" view** and a work journey (stage tracker) page.
- **DoD:** initiate a new-road work from a programme as HQ → stage 0 gate passed → tasks assigned to different users across stages 1–4 → one gate `RETURNED` and reworked → sanctions recorded by the correct approver level → award recorded; timing, assignees, and evaluators visible; invalid stage jumps rejected with `409`; every step in the audit log.

### M5b — Construction, handover & contractor closure *(Tier A, P0/P1)*
- **Stage 5:** contractor-defined milestones as weighted tasks; progress reports (percentage, remarks, photos, GPS); quality-test and site-record entries (quality test, site instruction, hindrance); milestone gate evaluation with rework loop; work progress rolls up from milestone weights; delay flagging.
- **Stage 6:** completion request, punch list, final inspection, documents; **handover creates or activates the asset(s)**, sets `dlp_end_date`, and writes lifecycle events (including the pre-asset journey).
- **Stage 7:** DLP tracking (shared with M9), end-of-DLP inspection, **contractor evaluation** (7.5.5), close work.
- **DoD:** continue the M5a road work → construction milestones (one fails quality and is reworked) → completion → handover → a new `OPERATIONAL` asset appears with origin work, contractor, cost, DLP end date, and the full journey (initiation to handover) on its timeline → DLP passes → contractor evaluation score computed and shown → work `CLOSED`.

### M6 — Dashboards & risk *(Tier A, P0/P1)*
- Risk engine (Section 9) with stored, explainable factor breakdown; recompute on relevant events (sync for MVP, background job for bulk).
- Role-specific dashboards (Section 13.3): KPI cards + charts + "Top priority assets" table with **"why"** popover.
- **DoD:** dashboard numbers match DB counts; changing an asset's condition changes its risk and rank; each priority row explains its score; scoped by jurisdiction.

### M7 — GIS map *(Tier B, P1)*
- Leaflet + OpenStreetMap (no API key). Markers for point assets, polylines for road segments (from GeoJSON or chainage → coordinates approximation), colour = condition or risk band.
- Filters shared with registry; click → Asset 360 popover/link; cluster markers.
- **DoD:** 500+ seeded assets render smoothly (clustering); filters work; click-through works.

### M8 — Documents *(Tier B, P1)*
- Upload to Cloudinary/Supabase Storage via backend-signed flow; store URL + metadata in `documents`; attach to asset / work / inspection / maintenance; typed (DPR, drawing, as-built, contract, completion certificate, inspection report, invoice, warranty, photo).
- **DoD:** upload, list, preview/download, and delete-by-permission all work; no files stored in the DB; secrets never reach the frontend.

### M9 — Contractors & DLP *(Tier B, P1)*
- Contractor master; contracts (via works); performance view (delays, defects during DLP, ongoing works), including evaluation scores produced at work closure (7.5.5).
- **DLP tracker:** assets in DLP, days remaining, defects raised during DLP, "contractor liable" queue; expiry alerts.
- Contractor portal view: my contracts, progress entry, assigned defects.
- **DoD:** an asset inside DLP raises a liable request that appears in the contractor's view; DLP-expiring-soon list is correct.

### M10 — Notifications, escalation, background jobs *(Tier C, P1/P2)*
- In-app notifications (`notifications` table, bell + unread count).
- Nightly job (BullMQ **or** a cron-triggerable endpoint): find overdue inspections & maintenance, create notifications, bulk-recompute risk.
- **DoD:** overdue items generate notifications once (idempotent); unread count updates.

### M11 — Measurement book (lite) *(Tier C, P2)*
- Per work: item, unit, contractor-claimed qty, measured qty, approved qty, verifier. Show claimed vs measured vs approved to demonstrate traceability. **No payment processing.**
- **DoD:** claimed 1000 m² vs measured 940 m² is recorded, verified by a different user, and visible on the work.

### M12 — Emergency / disaster mode *(Tier C, P2)*
- Create an emergency event (flood/cyclone/earthquake); field damage reports (asset, severity, photo, GPS, temporary action); event dashboard (roads/bridges/buildings affected, closures); convert damage → emergency work.
- **DoD:** an event dashboard aggregates affected assets and links to their timelines.

### M13 — Citizen complaints & integration adapters *(Tier C, P2)*
- Public complaint form (location pick, photo) → match nearest asset → maintenance request → public status tracking (limited view).
- Adapter interfaces + mock implementations for GRMS / IFMS / IWDMS / e-Procurement, with a sync-log screen.
- **DoD:** a complaint becomes a request on the correct asset; adapter mock returns sample data through the same interface a real integration would use.

---

## 9. Risk & decision support (explainable, not black-box)

### 9.1 Score (0–100, weights configurable, illustrative — not an engineering standard)
| Factor | Max | Formula |
|---|---|---|
| Condition | 40 | `(5 − condition_rating) / 4 × 40` (5 = Excellent … 1 = Critical) |
| Structural importance / criticality | 15 | `criticality(1–5) / 5 × 15` |
| Traffic / usage | 15 | `traffic_level(1–5) / 5 × 15` |
| Age vs design life | 10 | `min(age / design_life, 1) × 10` |
| Inspection overdue | 10 | `min(days_overdue / inspection_interval, 1) × 10` |
| History / open defects | 10 | `min(repairs_last_5y / 4, 1) × 5 + (open_high_defects > 0 ? 5 : 0)` |

**Bands:** 0–24 Low · 25–49 Medium · 50–74 High · 75–100 Critical.
Store `risk_score`, `risk_band`, and `risk_factors` (JSON with each factor's contribution) on the asset. The UI must show **why**, e.g. *"Poor condition (+30), high traffic (+12), inspection 14 months overdue (+10) …"*.

### 9.2 Recommendation rules (transparent)
| Situation | Suggested action |
|---|---|
| Critical band | Immediate inspection + prioritise for rehabilitation planning |
| High band + overdue inspection | Schedule inspection this week |
| Medium + poor condition trend | Plan periodic maintenance |
| Low | Routine maintenance only |
Display as **"Suggested"**; the officer decides. Never auto-approve spend.

### 9.3 Optional AI (Tier C, only if core is done and stable)
- Natural-language search over assets ("bridges in Surat with poor condition and overdue inspection") translated to filters.
- Inspection remark summarisation. If the AI call fails, the app must work identically.

---

## 10. Data model

### 10.1 Entities and key columns
(Postgres; use UUID PKs, `created_at/updated_at` on everything. Names are a guide — keep consistent once chosen.)

**org_units** — `id, type(STATE|CIRCLE|DIVISION|SUBDIVISION), name, parent_id`
**users** — `id, auth_id, name, email, phone, role, org_unit_id, designation, contractor_id?, is_active`
**contractors** — `id, name, class, contact, is_active`
**asset_types** — `id, code, name, category(ROAD|BRIDGE|CULVERT|BUILDING|ELECTRICAL|ROAD_FURNITURE|EQUIPMENT|OTHER), attribute_schema jsonb, inspection_interval_days, design_life_years`
**assets** — `id, asset_code(unique), qr_token, type_id, name, parent_id, org_unit_id(subdivision), district, taluka, road_code, start_chainage_km, end_chainage_km, lat, lng, geometry jsonb, attributes jsonb, lifecycle_status, condition_rating(1–5), criticality(1–5), traffic_level(1–5), commissioned_on, original_cost, design_life_years, custodian_id, origin_work_id, dlp_end_date, last_inspected_at, next_inspection_due, risk_score, risk_band, risk_factors jsonb`
**works** — `id, work_code, title, description, work_type(NEW|REPAIR|MAINTENANCE|REHAB|EMERGENCY), status, org_unit_id, requested_by, programme_id?, template_id, current_stage_id, initiation_type(PROGRAMME|DIRECTIVE|FIELD_NEED|COMPLAINT|EMERGENCY|DEPOSIT_REQUEST), initiated_by, initiation_ref, initiation_date, priority, source_type(INSPECTION|COMPLAINT|PERIODIC|EMERGENCY|DEPARTMENT|PROGRAMME|DIRECTIVE), source_ref, estimated_cost, sanctioned_amount, contractor_id, contract_value, tender_ref, start_date, planned_end, actual_end, dlp_months, progress_pct`
**work_assets** — `work_id, asset_id, role(CREATED|TARGET)`
**work_approvals** — `id, work_id, stage, approver_id, decision, remarks, decided_at`
**work_progress** — `id, work_id, reported_by, progress_pct, remarks, lat, lng, photo_urls, reported_at`
**programmes** — `id, code, name, description, financial_year, budget_head, allocated_amount, owner_org_unit_id, created_by, status`
**work_templates** — `id, code(NEW_ROAD|NEW_BRIDGE|NEW_BUILDING|REPAIR_REHAB|EMERGENCY|...), name, work_type, asset_category, is_active`
**stage_templates** — `id, template_id, seq, code, name, planned_days, gate_role, gate_checklist jsonb`
**task_templates** — `id, stage_template_id, seq, title, default_assignee_role, required_deliverables jsonb, is_mandatory, planned_days, is_milestone, weight`
**work_stages** — `id, work_id, stage_template_id, seq, status(LOCKED|ACTIVE|IN_REVIEW|PASSED|RETURNED|SKIPPED), started_at, due_at, planned_days`
**work_tasks** — `id, work_id, work_stage_id, task_template_id?, title, description, assigned_to, assigned_by, due_date, priority, status(PENDING|IN_PROGRESS|SUBMITTED|ACCEPTED|RETURNED|OVERDUE|SKIPPED), deliverables jsonb, submitted_at, accepted_by, accepted_at, remarks, is_milestone, weight`
**stage_evaluations** — `id, work_stage_id, evaluator_id, outcome(PASSED|PASSED_WITH_OBSERVATIONS|RETURNED|REJECTED), checklist jsonb, score?, remarks, evaluated_at`
**contractor_evaluations** — `id, work_id, contractor_id, evaluator_id, schedule_score, quality_score, rework_score, dlp_score, documentation_score, total_score, remarks, evaluated_at`
**site_records** — `id, work_id, task_id?, record_type(QUALITY_TEST|SITE_INSTRUCTION|HINDRANCE|MATERIAL_APPROVAL), title, result, recorded_by, verified_by, attachments jsonb, at`
**measurements** *(C)* — `id, work_id, item, unit, claimed_qty, measured_qty, approved_qty, recorded_by, verified_by, status`
**inspections** — `id, asset_id, type(ROUTINE|PRE_MONSOON|POST_MONSOON|SPECIAL|POST_EMERGENCY), inspector_id, inspected_at, condition_rating, severity, defects jsonb, remarks, recommendation, lat, lng, photo_urls, status`
**maintenance_requests** — `id, request_code, asset_id, source, source_id, title, description, severity, status, priority_score, assigned_to, contractor_id, due_date, is_overdue, dlp_liable, work_id?, estimated_cost, actual_cost, completed_at, verified_by, verified_at, verification_remarks`
**documents** — `id, asset_id?, work_id?, inspection_id?, maintenance_id?, doc_type, title, url, uploaded_by`
**complaints** *(C)* — `id, reporter_name, phone, description, lat, lng, photo_url, asset_id?, status, maintenance_request_id?`
**lifecycle_events** *(append-only)* — `id, asset_id, event_type, from_status, to_status, actor_id, actor_role, at, lat, lng, ref_type, ref_id, before jsonb, after jsonb, remarks`
**audit_logs** — `id, user_id, action, entity, entity_id, diff jsonb, ip, at`
**notifications** — `id, user_id, title, message, entity_type, entity_id, is_read, created_at`
**approval_limits** — `id, role, work_type, max_amount`
**emergency_events / damage_reports** *(C)*, **integration_logs** *(C)*

### 10.2 Cross-cutting rule — the immutable trail
Every important event stores: **who, role, when, where (if available), action, before → after, evidence, approval**. `lifecycle_events` and `audit_logs` are never updated or deleted by application code.

### 10.3 Relationships (text ER)
```
org_units 1─* users            org_units 1─* assets
asset_types 1─* assets         assets 1─* assets (parent/child)
assets *─* works (work_assets) works 1─* work_approvals / work_progress
assets 1─* inspections         inspections 1─0..1 maintenance_requests
assets 1─* maintenance_requests    contractors 1─* works
assets 1─* lifecycle_events    assets/works/... 1─* documents
```

### 10.4 Indexes (add on creation, not later)
`assets(type_id)`, `assets(org_unit_id)`, `assets(district)`, `assets(lifecycle_status)`, `assets(condition_rating)`, `assets(risk_band, risk_score DESC)`, `assets(next_inspection_due)`, `assets(dlp_end_date)`, `assets(parent_id)`, `assets(road_code, start_chainage_km)`, `works(status, org_unit_id)`, `maintenance_requests(status, assigned_to)`, `maintenance_requests(asset_id)`, `inspections(asset_id, inspected_at DESC)`, `lifecycle_events(asset_id, at DESC)`, `audit_logs(entity, entity_id)`, `notifications(user_id, is_read)`, `work_tasks(assigned_to, status, due_date)`, `work_tasks(work_id, work_stage_id)`, `work_stages(work_id, seq)`, `works(current_stage_id)`, `works(programme_id)`, `stage_evaluations(work_stage_id)`.

---

## 11. API design

**Base:** `/api/v1` · JSON · Bearer JWT (Supabase). Standard envelope:
```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 1500 } }
{ "success": false, "error": { "code": "INVALID_TRANSITION", "message": "..." } }
```
List endpoints accept `page, limit (max 100), sort, q` plus resource filters. Status codes: `400` validation, `401`, `403` role/jurisdiction, `404`, `409` invalid state transition. Validate all input (zod or similar). Rate-limit auth and write routes if Redis is enabled.

| Module | Endpoints (indicative) |
|---|---|
| M0 | `GET /health` |
| M1 | `GET /me`, `GET/POST /users`, `GET /org-units`, `GET /audit-logs` |
| M2 | `GET/POST /assets`, `GET/PATCH /assets/:id`, `GET /assets/:id/360`, `GET /assets/:id/timeline`, `GET /assets/:id/children`, `GET /assets/lookup?code=`, `GET/POST /asset-types` |
| M3 | `POST /inspections`, `GET /inspections`, `GET /inspections/:id`, `GET /assets/:id/condition-history`, `GET /inspections/overdue` |
| M4 | `GET/POST /maintenance-requests`, `GET /maintenance-requests/:id`, `POST /maintenance-requests/:id/{assign,start,complete,verify,close,cancel}` |
| M5a | `GET/POST /programmes`, `GET/POST /works`, `GET /works/:id`, `GET /works/:id/journey` (stages, tasks, evaluations), `GET /work-templates`, `GET /tasks/mine`, `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/{submit,accept,return}`, `POST /work-stages/:id/evaluate`, `POST /works/:id/{approve,reject,tender,award,hold}`, `GET /works/pending-approvals`, `GET /works/who-has-file` |
| M5b | `POST /works/:id/progress`, `POST /works/:id/site-records`, `POST /works/:id/{complete,handover,close}`, `POST /works/:id/contractor-evaluation`, `GET /works/:id/contractor-evaluation` |
| M6 | `GET /dashboard/summary`, `GET /dashboard/priority-assets`, `GET /dashboard/condition-distribution`, `POST /risk/recompute` |
| M7 | `GET /assets/geo?bbox=&filters` (GeoJSON) |
| M8 | `POST /documents/sign`, `POST /documents`, `GET /documents?asset_id=`, `DELETE /documents/:id` |
| M9 | `GET/POST /contractors`, `GET /contractors/:id/performance`, `GET /dlp/assets`, `GET /dlp/expiring` |
| M10 | `GET /notifications`, `PATCH /notifications/:id/read`, `POST /jobs/nightly` |
| M11–M13 | `measurements`, `emergency-events`, `complaints` (public), `integrations/:system/sync` |

---

## 12. Architecture & technology

### 12.1 Stack (fixed)
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS; Recharts for charts; Leaflet (+ OpenStreetMap tiles) for maps.
- **Backend:** Node.js + Express, modular monolith.
- **Database:** PostgreSQL on Supabase; **Supabase Auth**; Supabase Storage or Cloudinary for files.
- **Optional (already scaffolded, use only if needed):** Redis (ioredis) for caching dashboard aggregates and rate limiting; BullMQ for nightly/bulk jobs; MongoDB is **not** used in this project (data is relational).
- **Tooling:** Postman, Git/GitHub, VS Code / Claude Code.

### 12.2 Logical architecture
```
Next.js UI (role-aware)
      │ REST /api/v1  (JWT)
      ▼
Express API (stateless)
  routes → controllers → services → models
  middleware: auth · rbac · jurisdictionScope · validate · rateLimiter · errorHandler
      │
 ┌────┼───────────────┬───────────────┐
 ▼    ▼               ▼               ▼
Postgres (Supabase)  Redis (opt.)   Object storage   Adapters (mock)
                     cache/limits   documents/photos  GRMS·IFMS·IWDMS·eProc
      │
Background worker (BullMQ, opt.): nightly overdue scan, bulk risk recompute
```

### 12.3 Scalability story (state-scale, explained even if not all built)
- Stateless API behind a load balancer → horizontal scaling.
- Indexes (10.4), server-side pagination everywhere, no unbounded queries.
- Dashboard aggregates cached (Redis) with short TTL; heavy analytics later on a read replica / reporting store.
- Async jobs for notifications, bulk risk recompute, imports.
- Files in object storage; DB holds URLs only.
- Modular monolith first; extract modules (e.g., GIS, jobs) to services only when scaling needs differ.
- Seed **100k+ assets** in a performance test to prove list/filter latency.

### 12.4 Integration adapter pattern
```ts
interface ExternalSystemAdapter {
  name: string;
  fetchAssets?(params): Promise<ExternalAsset[]>;
  fetchWorks?(params): Promise<ExternalWork[]>;
  fetchExpenditure?(assetOrWorkId): Promise<Expenditure[]>;
  fetchDocuments?(id): Promise<ExternalDoc[]>;
}
```
MVP ships `Mock<System>Adapter` classes returning fixtures, behind the same interface. Real integrations replace the mock without touching business logic.

### 12.5 Security
JWT verification on every request; role + jurisdiction enforced server-side; secrets only in `.env`; secret/service keys never in the frontend; validate/sanitise input; signed uploads with type/size limits; audit log of all writes; rate limiting on auth/write routes; soft-delete only (no hard deletes of asset history).

---

## 13. UX / UI

### 13.1 Principles
1. **Asset-first:** any asset code, name, or QR resolves to Asset 360 in ≤ 2 steps.
2. **Role-first:** each role lands on a dashboard built for their job (not one generic dashboard).
3. **Field-first:** inspection and maintenance flows are mobile-first (thumb-reachable, large targets, auto-GPS, camera capture, works at 390 px).
4. **Explain everything:** every risk/priority shows its reason.
5. **Never a dead end:** empty, loading, error, and "no permission" states on every screen.
6. **Clarity over decoration:** dense but calm; government-grade, not flashy.

### 13.2 Visual design (light theme)
- **Theme:** light. Background `#F7F9FB`, surface `#FFFFFF`, border `#E2E8F0`, text `#0F172A` / muted `#64748B`.
- **Accent:** cyan `#00D9FF` for fills, highlights, active states. For **text/links on white use a darker cyan `#0891B2`** for readable contrast.
- **Fonts:** Space Grotesk (headings), Inter/system (body), Fira Code (asset codes, IDs, chainage).
- **Condition colours (consistent everywhere):** Excellent `#16A34A`, Good `#65A30D`, Moderate `#EAB308`, Poor `#F97316`, Critical `#DC2626`. Risk bands reuse the same scale.
- Tokens live in `tailwind.config` only — change once, apply everywhere.
- Status badges, tables, cards, and modals come from the shared UI kit (M0).

### 13.3 Dashboards per role
| Role | Landing dashboard |
|---|---|
| HQ / Secretary | Total assets, ongoing works, critical assets, district-wise condition, delayed works, maintenance backlog, top-10 priority assets, **programme progress and works pipeline by stage, stage-wise delays** |
| Circle SE | Circle performance, condition mix by division, high-risk infrastructure, overdue inspections |
| Division EE | Division assets, active works, **pending approvals**, **my tasks and stage gates awaiting my evaluation**, contractors, inspections due, maintenance board |
| Sub-division DEE | Assignments to make, verifications waiting, overdue items, my sub-division map |
| Field AE | **My assets**, today's inspections, nearby assets (GPS), pending issues, quick "Start inspection" |
| Contractor | My contracts, **milestone tasks and progress entry**, assigned defects (with DLP-liable flag), deadlines, **evaluation results** |
| Citizen *(C)* | Report an issue, track status |

### 13.4 Key screens
Login · Role dashboard · Asset list (table + map toggle) · **Asset 360** · Asset create/edit · Inspection form (mobile) · Inspection list/overdue · Maintenance board + detail · Programmes · Work list (pipeline by stage) · **Work journey** (stage tracker with tasks, evaluations, who-has-the-file) · **My tasks inbox** · **Stage gate evaluation screen** · Approvals inbox · Contractor list/detail · DLP tracker · Documents panel · Notifications · Admin (users, org units, asset types, approval limits) · Audit log.

**Asset 360 layout (wireframe)**
```
┌──────────────────────────────────────────────────────────────┐
│ BRIDGE-GJ-000781 · Bridge over River X        [Condition: 2] │
│ Surat · SH-XX @ 124.6 km · OPERATIONAL · In DLP (212 days)   │
│ Risk 68 HIGH  ▸ why?                     [Inspect] [Request] │
├───────────────┬──────────────────────────────────────────────┤
│ Identity      │ Tabs: Timeline | Inspections | Maintenance   │
│ Location/map  │       Documents | Complaints | Components    │
│ Origin work   │ ─────────────────────────────────────────── │
│ Contractor    │ 2030 Defect found → Request MW-2030-0098     │
│ People        │ 2029 Inspection: Good                        │
│ Cost summary  │ 2028 Handed over → asset created ...         │
└───────────────┴──────────────────────────────────────────────┘
```

### 13.5 Accessibility & quality
Keyboard-navigable, labelled inputs, sufficient contrast, no colour-only meaning (icon/text with colour), responsive from 360 px to desktop, consistent form validation messages.

---

## 14. Seed data specification

Realistic-looking but **clearly fake**, generated by a script (`database/seed/`), re-runnable and deterministic.

| Data | Volume |
|---|---|
| Org units | 1 state, 4 circles, ~12 divisions, ~30 sub-divisions (Gujarat district names for realism) |
| Users | 1–2 per role per scope + contractors (fake names) |
| Asset types | Road segment, Bridge, Culvert, Building, Equipment (lift, AC, fire system), Streetlight |
| Assets | 500 for demo (mix: ~60% road segments, 15% bridges/culverts, 15% buildings + components, 10% other); optional 100k perf dataset (separate script) |
| Programmes / Works | 2 programmes (fake, with allocations). ~40 works across all statuses, incl. 3 approved-awaiting-award, 5 in progress, 6 handed over. Templates seeded: New Road (full stages/tasks/checklists), New Bridge, New Building, Repair/Rehab, Emergency. **Hero new-road work** mid-construction with Stages 0–4 fully completed (tasks, assignees, evaluations, approvals) and one milestone previously returned for rework; one other work returned at a gate |
| Inspections | 2–5 per asset with condition trends; include 25 overdue assets |
| Maintenance requests | ~60 across statuses; ~10 overdue; ~8 `dlp_liable` |
| DLP | ~20 assets currently in DLP, 5 expiring within 30 days |
| Documents | placeholder files on ~15 assets |
Include a **hero asset** with a rich, complete timeline (plan → approval → tender → construction → handover → inspections → defect → repair → verify) for the demo.

---

## 15. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Asset list/filter p95 < 300 ms at 100k rows; Asset 360 < 1 s; dashboard < 1 s (cached) |
| Scalability | Stateless API; pagination; indexes; async for heavy work |
| Reliability | Idempotent jobs; transactional multi-table state changes (work handover, inspection submit) |
| Security | Server-side RBAC + jurisdiction; audit trail; secrets in env; validated input |
| Auditability | Append-only lifecycle events and audit logs |
| Usability | Mobile-first field flows; ≤ 60 s inspection; consistent states |
| Maintainability | Layered code, config-driven workflows, README + docs per module |
| Data integrity | FK constraints; enum checks; no hard deletes of asset history |
| Accessibility | See 13.5 |
| Observability | Request logging; health endpoint; readable error codes |

---

## 16. Build plan (module by module, with gates)

**Order** (each module ends with its DoD check and a short report):

| # | Module | Tier | Gate to pass before continuing |
|---|---|---|---|
| 1 | M0 Foundation | A | Boots, DB round-trip, UI shell |
| 2 | M1 Auth/RBAC/jurisdiction/audit | A | Cross-division access blocked at API |
| 3 | M2 Asset registry + Asset 360 | A | Create assets, filter, 360 renders |
| 4 | M3 Inspections & condition | A | Rating ≤ 2 auto-creates request |
| 5 | M4 Maintenance workflow | A | Full chain across different users |
| 6 | M5a Work initiation & stage engine | A | New-road work runs stages 0→4 with assigned tasks, gates, approvals, award |
| 7 | M5b Construction, handover & contractor closure | A | Handover creates asset with full journey; contractor evaluated |
| 8 | M6 Dashboards & risk | A | Explainable ranked priority list |
| 9 | M7 GIS map | B | 500 assets, clustered, filterable |
| 10 | M8 Documents | B | Upload/list/delete works securely |
| 11 | M9 Contractors & DLP | B | DLP-liable request reaches contractor |
| 12 | M10–M13 | C | Only if time remains |

**Time guidance** (confirm actual duration on the day — sources conflict between 8 and 24 hours):
- **8 h:** M0–M4 solid; M5a with the New Road template driving a work from initiation to award (tasks, gates, approvals); M5b limited to milestones, handover, and a simple contractor score; simple M6 dashboard with risk ranking; explain the rest. Reserve the last 45 min for seed data polish, demo rehearsal, and README. If short on time, keep the stage engine generic and seed only the New Road template in detail.
- **4–5 h (actual budget, see decisions log):** as 8 h, compressed — M0 30 min · M1 35 · M2 45 · M3 30 · M4 30 · M5a 45 · M5b 30 · M6 20 · seed/demo polish 20.
- **24 h:** all Tier A, then Tier B; pick one Tier C item (M10 or M13 adapters) for the pitch.
- **Rule:** never start a tier while the previous tier has failing DoD items. A working core loop beats a wide, half-working app.

**Per-module session template (paste when starting each module)**
```
Module: M<n> — <name>. Read PRD.md Section 8 (M<n>) and the sections it references.
1. List the files you will create/modify. Wait for my OK.
2. Implement only this module. Reuse existing components/helpers.
3. Add migrations, indexes, seed additions, and audit/lifecycle hooks it needs.
4. Run the DoD checklist and report each item pass/fail with evidence.
5. Stop. Do not start the next module.
```

---

## 17. Demo script (6–7 minutes)

1. **Problem (30 s):** fragmented systems; project → asset forgotten; reactive maintenance.
2. **Positioning (20 s):** "an asset-centric layer over GRMS/IFMS/IWDMS/e-Procurement, not a replacement."
3. **HQ dashboard (60 s):** critical assets, condition by district, top-priority list — click *why*.
4. **Asset 360 of the hero bridge (60 s):** full timeline from proposal to today.
5. **Field flow on a phone (60 s):** AE opens asset by code/QR → inspection with photo + GPS → rating 2.
6. **Automation (30 s):** maintenance request appears automatically, marked **DLP-liable** to the original contractor.
7. **Workflow (60 s):** assign → contractor completes → different officer verifies → asset back to operational, timeline updated.
8. **Lifecycle continuity (60–75 s):** open the hero new-road work — show the journey from the government programme/directive through survey, design, approvals, tender, and construction; show the tasks assigned at each stage, who evaluated each gate, and who has the file now; then hand over → a new asset is created with the entire journey on its timeline; close with the contractor evaluation score.
9. **Map + scale (30 s):** clustered map; say pagination/indexes/Redis/async workers/read replicas.
10. **Close (15 s):** "one identity, one timeline, decisions instead of records."

---

## 18. Assumptions to state at the start (and questions for evaluators)

**Assumptions:** physical infrastructure only (roads, bridges, buildings + components); PWD-style hierarchy and role names; cost-based approvals are configurable and illustrative; external systems are mocked; risk weights are illustrative.

**Questions (ask 5–6, in this order):**
1. Which asset classes are in scope (roads, bridges, culverts, buildings, electrical, road furniture)?
2. Which lifecycle stages must the system manage end to end?
3. Who are the primary users and what can each role do?
4. What must be stored for every asset, and must full history be kept?
5. Is GIS/location and mobile field capture expected?
6. What scale should we design for, and are integrations with existing systems expected?

---

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope too large for the time | Strict tiers; DoD gates; drop Tier C without guilt |
| Half-working breadth | Finish the core loop (inspect → request → verify → asset history) first |
| Wrong domain claims | Mark research-derived facts as "to verify" (Appendix A); use neutral wording |
| Demo shows empty screens | Hero asset + deterministic seed script |
| Security shortcuts | Server-side RBAC/jurisdiction from M1, tested at API level |
| Map/GIS time sink | Leaflet + OSM only; approximate road geometry; cluster markers |
| Env/setup issues | Boilerplate pre-built; `.env.example`; health endpoint |

---

## 20. Out of scope / future roadmap

Real integrations (GRMS/IFMS/IWDMS/eProcurement), payment/billing, native apps, offline-first sync, IoT/sensor feeds, drone/LiDAR imagery, predictive deterioration models, public transparency portal, multilingual (Gujarati/Hindi) UI, tamper-evident storage (hash-chained audit), and a full performance/load test suite.

---

## 21. Decisions log (update as we go)

| Date | Decision | Reason |
|---|---|---|
| — | Client scope: Gujarat R&B physical infrastructure asset management | Confirmed by user |
| — | Positioned as asset-centric integration/lifecycle layer, not a replacement | Existing systems exist |
| — | Stack: Next.js + Express + Supabase Postgres/Auth; Redis/BullMQ optional | Speed + scalability story |
| — | Theme: light, cyan accent | User preference |
| — | Build order and tiers per Section 16 | Time-boxed hackathon |
| — | Added template-driven stage/task/evaluation journey (7.5); M5 split into M5a/M5b | Covers government-initiated new-asset lifecycle through contractor closure, for every asset type |
| 2026-09-28 | Time budget 4–5 h: M0–M4 full, M5a/M5b per the 8 h cut, M6 single scoped dashboard; Tier B/C in pitch unless ahead | User-confirmed duration |
| 2026-09-28 | M5b: site records stored but no dedicated screen; entered from the milestone task | Time budget |
| 2026-09-28 | Roles merged to 4 for the demo: HQ (Admin+HQ+SE), EE (EE+DEE), AE, CONTRACTOR | Fewer logins to showcase; permission matrix still honoured per merged role |
| 2026-09-28 | Jurisdiction uses a materialised `org_units.path` (e.g. `/GJ/CIR-AMD/DIV-AMD/SUB-DAS/`) with a prefix index | Subtree scoping is one indexed `LIKE 'prefix%'`, no recursive query per request |
| 2026-09-28 | Risk engine + generic workflow engine built in M2 (not M6) | Asset 360 and M3 need live risk; M6 becomes dashboards only |
| 2026-09-28 | Full 500-asset demo seed generated in M2 | One deterministic generator; M7 map and M6 dashboards get realistic volume for free |
| 2026-09-28 | RLS enabled on every table with no policies; the API connects as the DB owner | Supabase exposes `public` tables via its Data API; RLS-with-no-policy closes that door so the Express API is the only way in |
| 2026-09-28 | Dashboards and screens are the builder's call within Section 13; one dashboard page whose widgets change by role | User delegated UI decisions |
| 2026-09-28 | Single backend `.env` at repo root; frontend uses `frontend/.env.local` (public values only) | Keep secrets out of the Next.js bundle |
| 2026-09-28 | Migrations are plain SQL files applied by `database/migrate.mjs` (tracked in `schema_migrations`) | No ORM dependency; fast to write |
| 2026-09-28 | `docs/*-template.md` not filled; PRD covers them. Per-module notes go in `docs/modules/` | Time budget |

---

## Appendix A — Research-derived claims to verify (do not state as fact in the demo)

These came from provided research and should be confirmed with evaluators or the source before being quoted:
- That the department maintains an asset register / computerised asset management under its works manual.
- The list of existing systems (GRMS/GujRAMS, Works Monitoring System, Road Mitra, IWDMS, IFMS, e-Procurement, others) and their exact modules.
- The R&B organisation levels and titles (Chief Engineer → SE → EE → DEE → AE) and circle/division/sub-division structure.
- The computerised measurement-book requirement and its value threshold.
- Defect Liability Period practice and typical durations.
- Approval/sanction levels by cost (we use configurable, illustrative values only).
- The exact stage list, tasks, gate checklists, planned durations, and contractor-evaluation weights in the work templates (7.5) — confirm against the department's actual process before presenting them as fact.

## Appendix B — Glossary
**Asset** physical infrastructure item that persists after a work. **Work** a time-bound project/activity. **Chainage** distance along a road in km from a reference start. **DLP** Defect Liability Period, during which the contractor is responsible for defects. **MB** Measurement Book, the record of measured quantities of work. **TS / AA** Technical Sanction / Administrative Approval. **Asset 360** the unified asset profile. **RBAC** role-based access control. **Jurisdiction scope** restricting data to the user's org-unit subtree. **Lifecycle event** an immutable record of a change to an asset. **ROB/RUB** road over/under bridge.

## Appendix C — Definition of Done (global, applies to every module)
- [ ] Meets the module's DoD in Section 8
- [ ] Server-side RBAC and jurisdiction enforced and tested via API
- [ ] Audit log and lifecycle events written for state changes
- [ ] List endpoints paginated; new filter columns indexed
- [ ] Loading / empty / error states present
- [ ] Works at 390 px and desktop widths
- [ ] Migrations and seed updated; app boots from a clean database
- [ ] No secrets committed; `.env.example` updated
- [ ] Short module note added to `docs/` (what was built, how to test)
