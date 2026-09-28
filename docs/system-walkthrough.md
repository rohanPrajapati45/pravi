# GujInfra 360 — complete system walkthrough (flows + edge cases)

How to explain the whole system, end to end, in the order an evaluator would follow it. Every rule and edge case below is enforced by the **API** (not just hidden in the UI) and most are covered by the automated smoke tests (`npm run test:smoke -w backend`).

---

## 0. The 30-second version

> Government infrastructure outlives the projects that build it, but its information is scattered across systems — once a project closes, the asset is forgotten and maintenance becomes reactive. **GujInfra 360 gives every road, bridge and building one identity and one timeline**: from the government's decision to build, through survey, sanction, tender, construction and handover, to every inspection, repair and contractor evaluation after. It turns that record into decisions — an explainable, ranked list of what to inspect and repair first. It sits **on top of** existing systems (GRMS, IFMS, IWDMS, e-Procurement), not in place of them.

```
            ┌──────────────── WORK (project) ────────────────┐
 Mandate → Survey → DPR → Sanction → Tender → Construction → Handover → DLP & closure
                       │                                     │
                       └── asset registered as PLANNED       └── asset becomes OPERATIONAL, DLP starts
                                                                   │
            ┌──────────────── ASSET (operations loop) ─────────────▼────────────┐
            │  Inspect → (poor?) auto repair request → assign → fix → verify    │
            │     ▲                                                     │       │
            │     └──────────── risk recomputed, ranking updated ◀──────┘       │
            └──────────────── high risk → new rehabilitation WORK ──────────────┘
```

---

## 1. Who uses it — roles and jurisdiction

| Role (demo login) | Real-world post | Sees | Main job in the system |
|---|---|---|---|
| **HQ** — Meera Desai, Suresh Joshi | Chief Engineer, Secretary (also acts as Admin, SE) | Whole state | Initiate works, big approvals, award/handover/closure gates, administration |
| **EE** — Rohit Parmar (Ahmedabad), Vikram Rana (Surat) | Executive Engineer (+ Deputy EE) | Own division and below | Assign work, review submissions, pass EE gates, approve up to ₹2 Cr, verify repairs |
| **AE** — Kiran Solanki, Nisha Chauhan, Pooja Mehta | Assistant Engineer | Own sub-division | Inspections with GPS/photos, field tasks, repairs, verifying others' repairs |
| **CONTRACTOR** — Harsh Vora (Aarav), Dev Shah (Kaveri) | Contractor representative | Only their contracts/jobs | Milestones, repairs assigned to them, defects under their liability |

**Jurisdiction model:** offices form a tree — State → Circle (4) → Division (12) → Sub-division (32). Each office has a path like `/GJ/CIR-AMD/DIV-AMD/SUB-DAS/`. A user sees everything whose office path starts with theirs.

| Edge case | Result |
|---|---|
| Kiran (Daskroi AE) opens a Surat asset, or a sibling sub-division's asset | **403** "outside your jurisdiction" |
| Rohit (Ahmedabad EE) lists offices | Only his division and its 3 sub-divisions |
| A contractor opens a request not assigned to their firm | **403** |
| AE tries an EE/HQ action (assign, approve, close) | **403** with the roles that are allowed |
| A page the role may not use (e.g. AE → Audit log) | "You don't have access to this page" (and the API refuses too) |

Why a path, not recursion: "everything under my office" is one indexed `LIKE 'prefix%'` — cheap at state scale.

---

## 2. Signing in and staying signed in

**Flow:** login page → one-click demo account (or email + password) → Supabase Auth issues a token → the app calls `GET /me` → API verifies the token, loads the profile (role + office), caches it until the token expires (max 5 min) → role-specific dashboard.

| Edge case | Result |
|---|---|
| No token / expired or forged token | **401** → app returns to login |
| Valid login but no GujInfra profile | **403** "No GujInfra profile is linked" |
| Admin deactivates a user while they are signed in | Cache is cleared instantly → their next click gets **403**; new sign-in fails ("User is banned") |
| Admin changes someone's role/office | Applies on their next request (cache invalidated) |
| Token refresh | Handled silently by the client; profile not reloaded |

---

## 3. Asset registry and Asset 360

**Registering an asset** (HQ/EE/AE): pick a **type** → the form builds itself from that type's attribute schema (e.g. Bridge: structure type, spans, length, load class) → pick the **sub-division** → location (GPS button) → importance/traffic → save. The asset gets a code like `RDB-BR-001234` and a QR token; a `ASSET_REGISTERED` event starts its timeline; risk is computed immediately.

**Asset 360** answers five questions on one page: *what is it* (identity, attributes, components), *how did it come to exist* (origin work, contractor, cost, sanction), *what happened to it* (timeline, inspections, repairs), *what condition is it in* (condition, risk + "why?", overdue, DLP), *what next* (suggested action).

| Edge case | Result |
|---|---|
| Road segment without road code or chainage | **400** |
| End chainage before start chainage | Rejected by a database constraint |
| Missing a required attribute, wrong type, or a value not in the choice list | **400** with per-field messages |
| Office chosen is a division, not a sub-division | **400** "Assets belong to a sub-division" |
| Adding a component (lift, AC) to a retired parent | **409** |
| AE edits importance/traffic | **403** — AE may only correct name, attributes and location |
| Editing a retired asset | **409** "Retired assets are read-only" |
| Lookup by `rdb-br-000001` (lower case) or by QR token | Works (case-insensitive) |
| Every edit | Timeline shows `before → after` for each changed field |

**Asset lifecycle (state machine):** `PLANNED → UNDER_CONSTRUCTION → OPERATIONAL ⇄ UNDER_MAINTENANCE / UNDER_REHABILITATION / CLOSED_TEMPORARILY → RETIRED`

| Edge case | Result |
|---|---|
| Jump that isn't in the map (e.g. CLOSED_TEMPORARILY → UNDER_CONSTRUCTION) | **409** |
| Close temporarily or retire without remarks | **400** |
| Manually setting UNDER_MAINTENANCE | Not offered — only the system does it when repair work starts |
| AE changing status | **403** (EE/HQ only) |

---

## 4. Field inspection (mobile-first)

**Flow (AE or EE, on a phone):** enter the asset code/QR → GPS chip shows accuracy → tap condition **1–5** → severity (auto-raised for ratings 1–2) → defect quick-picks for that asset category (or type your own) → photos (compressed to ≤1600 px, uploaded **directly** to private storage with a one-time token) → submit.

**What happens in one database transaction:**
1. Inspection saved (code `INS-2026-…`, GPS, distance from the asset's registered location).
2. Asset condition, last-inspected and **next due = today + the type's interval** updated.
3. If **rating ≤ 2 or severity HIGH** → a maintenance request is raised automatically (severity HIGH if rating 1 or HIGH severity; due in 7 / 15 / 30 days by severity).
4. If the asset is still inside its **Defect Liability Period**, the request is flagged **contractor-liable** and the original contractor is pre-filled from the asset's origin work.
5. Risk recomputed; timeline + audit written; the division EE is notified (Activity/bell).

| Edge case | Result |
|---|---|
| Rating 4 | No request raised |
| Poor rating on an asset that already has an open request | **Linked to the existing request**, no duplicate |
| Inspecting a PLANNED or RETIRED asset | **409** |
| Photo path belonging to another asset (tampering) | **400** |
| More than 6 photos / non-image / > 5 MB | Rejected |
| GPS denied | Inspection still submits (no location) |
| Captured > 2 km from the registered location | Accepted, but flagged "captured X km from the asset" |
| Rating 0 or 6 | **400** |
| HQ or contractor submits an inspection | **403** (field roles only) |
| An inspector reviews their own inspection | **403** — review must be by someone else (EE/HQ) |

---

## 5. Maintenance workflow

```
OPEN ──assign──▶ ASSIGNED ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED ──verify──▶ VERIFIED ──close──▶ CLOSED
  │                 │                      ▲                        │
  └──cancel──┬──────┘                      └──────reject (rework)───┘
             ▼
         CANCELLED
```

| Step | Who | Rules and side-effects |
|---|---|---|
| Raise | Automatic (inspection) or HQ/EE/AE manually | DLP check as above; EE notified |
| Assign | EE/HQ | Only an **AE inside the asset's division** or a **contractor login**; the liable contractor is listed first; sets due date |
| Start | **Only the assignee** | Asset → `UNDER_MAINTENANCE` automatically |
| Complete | **Only the assignee** | **After-photo + remarks mandatory** |
| Verify | EE or AE who is **neither the assignee nor the completer** | New condition rating → asset condition updated → back to `OPERATIONAL` → risk recomputed |
| Reject | Same independence rule | Back to IN_PROGRESS; rework counter +1; remarks required |
| Close | EE/HQ | Actual cost recorded (₹0 when borne by the contractor under DLP) |
| Cancel | EE/HQ, only before work starts | Remarks required |

| Edge case | Result |
|---|---|
| Verify while still OPEN / close twice / cancel after start | **409** |
| Complete without a photo | **400** |
| The contractor or AE who did the work tries to verify | **403** "The person who did the work cannot verify it" |
| AE from another sub-division tries to start | **403** |
| Two jobs in progress on one asset; one verified | Asset stays under maintenance until the last one finishes |
| Due date passes before completion | Shown as **overdue**, sorted to the top everywhere |
| Other contractor opens the job | **403** |

---

## 6. The work journey — from government mandate to contractor closure

Every work follows a **template** (configuration, not code). A template = ordered **stages**; each stage has **tasks** (assigned to a named person, with required deliverables) and ends at a **gate** (an independent evaluation). Templates: **New Road** (full), New Bridge, New Building, Repair/Rehab, Emergency.

### New Road — stage by stage

| # | Stage | Tasks done by | Gate evaluated by | What passing the gate does |
|---|---|---|---|---|
| 0 | Initiation & mandate | Initiator (HQ) — order reference, responsible division | **HQ** (a different HQ officer) | Opens survey |
| 1 | Survey & investigation | AEs — alignment, topo/traffic, soil, screening | **EE** | Opens design |
| 2 | Design & estimate (DPR) | AE — drawings, BoQ, schedule | **EE** | **Asset registered as PLANNED** (gets its identity early, with the history so far) |
| 3 | Approvals & clearances | AE (TS note, clearances), HQ (budget) | **By cost limit** — EE ≤ ₹2 Cr, above → HQ | Technical sanction + administrative approval recorded |
| 4 | Tender & award | EE — tender ref, evaluation, agreement | **HQ** | Contractor, contract value, dates, **DLP months** recorded |
| 5 | Mobilisation & construction | **Contractor** — 7 weighted milestones with photos + test results | **EE** | Asset **UNDER_CONSTRUCTION** on entry; physical progress = accepted milestone weights |
| 6 | Completion & handover | Contractor (completion, punch list), AE (final inspection), EE (as-built, certificate) | **HQ** | **Asset OPERATIONAL**: commissioned today, cost = contract value, origin work + contractor linked, **DLP end date set**, condition 5, first inspection due |
| 7 | DLP & closure | AE (end-of-DLP inspection), EE (release reference) | **HQ** | **Contractor evaluation computed**; work CLOSED |

**Initiation sources:** government programme, directive, deposit request from another department, field need, emergency, complaint. **"Who has the file now"** on every work shows the stage, the people holding pending tasks, days in stage, delay, and who evaluates next.

### Task rules

| Edge case | Result |
|---|---|
| Submitting without every required deliverable | **400** listing what's missing |
| Submitting a task in a stage that hasn't opened | **409** "earlier stages must pass their gates first" |
| Accepting your own submission | **403** |
| Returning without saying what to fix | **400** |
| Assigning a department task to a contractor, or a contractor task to staff | **400** |
| Assigning a contractor task before the award, or to a different firm | **409 / 400** |
| Assigning to someone outside the work's division | **400** |

### Gate rules

| Edge case | Result |
|---|---|
| Evaluating a LOCKED or already PASSED stage | **409** |
| Passing while any mandatory task is not accepted | **409** listing the tasks |
| "Passed" with an unticked checklist item | **400** — use "passed with observations" + remarks |
| Anyone who assigned-to-self / submitted a task in that stage evaluates its gate | **403** — an independent officer must evaluate |
| EE evaluates an HQ gate | **403** |
| EE approves ₹12.1 Cr (limit ₹2 Cr) | **403** "exceeds your approval limit — escalate to HQ" |
| Administrative approval > technical sanction | **400** |
| Award without all contract fields / planned end before start / inactive contractor | **400** |
| Handover of a new asset without a completion-certificate reference | **400** |
| **Returned** gate | Chosen tasks go back to RETURNED with the remarks; stage stays open; return counter shown |
| **Rejected** gate | Work stops (REJECTED) |

**Contractor evaluation (explainable, 0–100):** schedule adherence 30 (delay vs contract period), quality 30 (milestones passed first time), rework 15, defects during DLP 15, documentation 10 — each with the reason shown (e.g. "6 of 7 milestones passed quality check first time"). It informs decisions; it never penalises automatically.

**Repair/Rehab and Emergency** use short paths on **existing** assets: execution sets the asset `UNDER_REHABILITATION`, the final gate returns it to `OPERATIONAL` with the post-repair condition. Emergency records estimate and approval *after* the immediate action.

---

## 7. Risk and decision support

**Score (0–100)** — condition 40 · structural importance 15 · traffic 15 · age vs design life 10 · inspection overdue 10 · repair history / open high defects 10. **Bands:** Low < 25 ≤ Medium < 50 ≤ High < 75 ≤ Critical.

**"Why?"** — every score shows each factor's points and a plain reason ("Condition 2/5 (poor) +30, Inspection 4 months overdue +10…").
**Suggested action** — critical → immediate inspection + rehab planning; high + overdue → inspect this week; medium + moderate condition → periodic maintenance; else routine. Always labelled *Suggested*; the officer decides.

Recomputed automatically on every asset edit, inspection, repair verify/cancel and handover; HQ can bulk-recompute (524 assets in < 1 s with one set-based update — the nightly-job pattern at state scale).

**Dashboards** (all numbers scoped exactly like the lists and checked against direct database counts in tests): HQ — state KPIs, top-10 priority with "why?", condition by district, pipeline, programmes, delayed works; EE — division KPIs, "my desk" (tasks, reviews, gates), verification queue; AE — my area, inspections due with *Inspect* buttons, my repairs; Contractor — works, milestones, liable defects, evaluation scores.

---

## 8. Accountability — every action, every person, every second

| Mechanism | What it gives |
|---|---|
| **Asset timeline** (`lifecycle_events`) | The asset's whole life in order — works, gates, inspections, repairs, status changes, with actor and time. **Database trigger rejects any update/delete.** |
| **Audit log** (`audit_logs`) | Every write in the system with before/after; also append-only. Passwords are never stored in it. |
| **Activity feed + bell** | Who did what **to whom**, when (to the second): "Rohit Parmar assigned a task → Kiran Solanki · 14:32:07". Tabs: all / sent to me / done by me; live refresh; unread count on the bell. |
| **Timestamps on records** | Tasks show assigned/submitted/accepted times and names; requests show when raised; works show when initiated. |

---

## 9. Administration (HQ)

| Area | Rules |
|---|---|
| Users | Role must match office level (HQ at state/circle, EE at division, AE at sub-division, contractor linked to a firm). Transfer = change office. Deactivation blocks the API immediately and sign-in at the identity provider; history is kept (accounts are never deleted). Password reset. **Cannot deactivate/demote yourself; cannot remove the last HQ administrator.** |
| Offices | New circle only under state, division only under circle, sub-division only under division; unique codes. |
| Asset types | Add a new kind of asset and its form fields (text/number/choice/yes-no, units, required) — no code change; disable a type to hide it from new registrations. |
| Approval limits | EE limit editable; applies to the very next approval gate; HQ is always unlimited. |
| Contractors | Register/deactivate firms (inactive firms cannot be awarded); see average score, active works, open DLP defects. |
| System | Health, counts, applied migrations, recompute risk. |

---

## 10. Security and data integrity

- **Server-side enforcement**: role + jurisdiction checked on every endpoint; the UI hiding a button is never the control.
- **The API is the only door**: Supabase row-level security is on with no policies, so the public data API returns nothing; the secret key lives only on the backend.
- **Validation** on every input (zod) → readable 400s with per-field messages.
- **Transactions** for every multi-step business event (inspection, maintenance step, gate) — all or nothing.
- **Files**: private bucket, one-time upload tokens, 1-hour read links, type/size limits, owner-path checks.
- **Immutable history**: timeline and audit tables reject edits at the database level.

## 11. Scaling to the whole state

Stateless API behind a load balancer · path-indexed jurisdiction · indexes on every filter column + trigram search · server-side pagination everywhere (list ~70 ms, dashboard ~0.4 s) · set-based batch jobs → BullMQ workers (nightly overdue scan, notifications, risk) · Redis cache for dashboards · read replica for analytics · object storage for files · adapters for GRMS/IFMS/IWDMS/e-Procurement sharing asset and work codes instead of copying data · modular monolith, split services only when a module's load differs.

## 12. Honest limitations (say them before you're asked)

- Built: Tier A (M0–M6) + activity trail + administration. Not yet: GIS map, document management, DLP tracker page, notifications/nightly jobs, measurement book, emergency mode, citizen complaints, live integrations.
- Stage 7 (closure) can be recorded before the DLP ends; DLP keeps being tracked on the asset.
- Risk weights, approval limits, stage lists and durations are **illustrative** — confirmed with the department at handover.
- Roles are merged to four for the demo; splitting them back is configuration.
- Demo runs on free hosting (first request after idle can take ~50 s) and a single shared demo database.

## 13. Likely evaluator questions — short answers

| Question | Answer |
|---|---|
| Why not just use GRMS? | We don't replace it — we add the asset identity + lifecycle thread across systems; GRMS data would arrive through an adapter. |
| What stops an engineer approving their own work? | Server rules: submitter ≠ reviewer, doer ≠ verifier, gate evaluator ≠ anyone who worked on the stage — all return 403. |
| What if two inspections report the same defect? | The second links to the open request; no duplicates. |
| What if the contractor's work fails after handover? | Defects inside DLP are auto-flagged contractor-liable and routed to that firm; it affects their evaluation score. |
| How do you know where the inspector was? | GPS with accuracy on every inspection; flagged if > 2 km from the asset. |
| Can history be altered? | No — timeline and audit tables reject updates/deletes at the database level. |
| How does it scale to lakhs of assets? | See §11; lists are indexed and paginated, heavy work is set-based and moves to workers. |
| What happens when an officer is transferred? | Admin changes their office — visibility follows immediately; their past actions stay attributed. |
| Is the risk score an AI black box? | No — a transparent formula with every factor shown; the officer decides. |
| How is it handed over? | Production seed (configuration only) + `create-admin` + Administration console; see `docs/handover.md`. |
