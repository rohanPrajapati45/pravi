# End-to-end walkthrough: a new asset from mandate to maintenance

Every demo login uses the password **`GujInfra@2026`**.

| Who | Login | Role |
|---|---|---|
| Meera Desai | hq@gujinfra.example | HQ (Chief Engineer) |
| Suresh Joshi | secretary@gujinfra.example | HQ (second officer for independent gates) |
| Rohit Parmar | ee.ahmedabad@gujinfra.example | EE, Ahmedabad division |
| Kiran Solanki | ae.daskroi@gujinfra.example | AE, Daskroi sub-division |
| Harsh Vora | contractor.aarav@gujinfra.example | Contractor (Aarav firm) |

**Rules to keep in mind:**
- Only the EE or HQ can assign a task or review a submission, and nobody can review their own submission.
- A stage's gate must be passed by an officer who was **not assigned to** and **did not submit** any task in that stage. That is why two HQ users exist.
- A gate can pass only after all mandatory tasks in the stage are *Accepted*.
- Approval limits: the EE can approve up to ₹2 Cr; above that, HQ must approve.
- Each task goes through the same loop: **Assign** (EE/HQ) → **Submit** with deliverables (assignee) → **Accept** (EE/HQ reviewer).

---

## Part A — Build a new road (the full lifecycle)

### Step 1 — Create the work (Meera, HQ) · `/works/new`
| Field | Value |
|---|---|
| Template | **New road** |
| Title | `Kasindra–Bareja link road, new 2-lane` |
| Initiated from | Government programme / budget head (then pick any listed Programme) |
| Order / reference number | `GR/RB/2026/114` |
| Order date | today |
| Responsible division | Ahmedabad division |
| Priority | High |
| Indicative estimate (₹) | `18000000` (₹1.8 Cr, which keeps approval within the EE's limit) |
| Target start / end | `2026-10-15` / `2027-09-30` |
| Objective | `All-weather link between Kasindra and Bareja villages` |
| **Asset this work will create:** Asset name | `Kasindra–Bareja Link Road` |
| Sub-division | Daskroi |
| Road code | `DMO-AMD-31` |
| Start / end chainage (km) | `0` / `6.4` |

Click **Create**. All 8 stages are created, the work becomes PROPOSED, and Meera is assigned the two Initiation tasks.

### Step 2 — Initiation & mandate
1. **Meera** → `/tasks` (or the work page) → **Submit** each task:
   - Order / directive reference: `GR/RB/2026/114`
   - Initiation note: `Division assigned, targets set`
2. **Rohit (EE)** → **Accept** both. Meera can't accept her own submissions.
3. **Suresh (Secretary)** → **Evaluate gate** → tick all 3 checklist items → **Passed**. Meera can't do this because she worked on the stage.

Survey opens next. The banner **"Who has the file now"** and the 🔔 bell show each hand-off with who, to whom and the time.

### Step 3 — Survey & investigation
1. **Rohit** → **Assign** all 4 tasks to **Kiran Solanki** and set a due date.
2. **Kiran** → **Submit** each task:

   | Task | Deliverables |
   |---|---|
   | Reconnaissance & alignment | Alignment options map: `ALN-31-A` |
   | Topographic & traffic survey | Survey report: `SUR-31`, Traffic count summary: `TC-31: 4,200 PCU/day` |
   | Soil investigation | Soil test report: `SOIL-31` |
   | Land/utility/environment screening | Screening note: `SCR-31: no forest land` |

3. **Rohit** → **Accept** all 4, then → **Evaluate gate** → tick all → **Passed**.

### Step 4 — Design & estimate (DPR)
1. **Rohit** assigns the 3 tasks to **Kiran**.
2. Kiran submits them:
   - Drawings reference: `DRG-31-01..12`
   - BoQ reference: `BOQ-31`; Cost estimate: `₹1.8 Cr`
   - Schedule: `11 months`
3. **Rohit** accepts all 3, then evaluates the gate → **Passed**. The **asset is now registered as PLANNED** (code `RDB-RD-…`). It appears under Assets and on the map.
4. *Documents:* on the work page → **Documents** card → **+ Upload** → type **DPR**, title `DPR – Kasindra–Bareja road`, attach any PDF. It also shows in the asset's **Documents** tab.

### Step 5 — Approvals & clearances
1. **Rohit** assigns the TS note and clearances tasks to **Kiran**, and the budget confirmation task to **Meera**.
2. Kiran submits `TS-31/2026` and `CLR-31`. Meera submits `Budget head 5054-04-337`.
3. **Rohit** accepts all 3.
4. **Rohit** → **Evaluate gate** → Passed, with:

   | Field | Value |
   |---|---|
   | Technical sanction (₹) | `18000000` |
   | Administrative approval (₹) | `17500000` (can't exceed the TS) |
   | TS reference | `TS/AMD/2026/31` |
   | AA reference | `AA/RB/2026/31` |

   The work becomes **ADMIN_APPROVED**. *Edge case to demo:* with AA above ₹2 Cr, the EE's gate is blocked and it needs HQ.

### Step 6 — Tender & award
1. **Meera** assigns the 3 tasks to **Rohit**.
2. Rohit submits: tender reference `GEM/2026/B/31`, evaluation minutes `BEM-31`, agreement `AGR-31/2026` + work order `WO-31`.
3. **Meera** accepts all 3.
4. **Meera** evaluates the gate → Passed, with:

   | Field | Value |
   |---|---|
   | Tender reference | `GEM/2026/B/31` |
   | Contractor | **Aarav Infra Works (Demo)** |
   | Contract value (₹) | `16500000` |
   | DLP (months) | `24` |
   | Start date / planned completion | `2026-11-01` / `2027-09-30` |

   The work becomes **AWARDED**. The contractor can now see it.

### Step 7 — Construction (7 milestones, weights 5/20/15/20/25/10/5)
1. **Rohit** assigns each milestone to **Harsh Vora** (contractor).
2. **Harsh** → **Submit** each milestone:
   - Progress photos + Quality test result: e.g. `QT-31-EW-01`
   - Milestone completion: `100`
   - Note: `Completed km 0–6.4`
3. **Rohit** → **Accept milestone** each time. Work progress % goes up by that milestone's weight.
   - *Edge case:* **Return for rework** with remarks `Camber not per drawing`. Harsh resubmits and the return count appears.
4. After all 7 are accepted, **Rohit** evaluates the gate → **Passed**. The work becomes **COMPLETED** and the asset **UNDER_CONSTRUCTION**.

### Step 8 — Completion & handover
1. **Rohit** assigns the tasks:
   - Completion request → Harsh
   - Joint final inspection → Kiran
   - Punch-list rectification → Harsh
   - As-built drawings + completion certificate → himself or Kiran
2. The assignees submit: `CR-31`, `FIR-31`, rectification photos, `ASB-31` + `CC-31/2027`.
3. **Meera** accepts any task Rohit did himself; Rohit accepts the rest.
4. **Meera** evaluates the gate → Passed, with Completion certificate reference `CC-31/2027`.
5. The **asset becomes OPERATIONAL, and its DLP runs 24 months**, tagged to Aarav Infra.
6. Upload the **As-built** and **Completion certificate** PDFs in Documents.

### Step 9 — Life in service (the asset is now in DLP)
1. **Kiran** → `/inspections/new`. Scan or type the new asset code:

   | Field | Value |
   |---|---|
   | Inspection type | Post-monsoon |
   | Condition | **2 (Poor)** |
   | Severity | **High** |
   | Defects | Potholes, Edge breaking |
   | Photo | take one (required as evidence) |
   | Remarks | `Potholes at km 2.1–2.4` |
   | Recommendation | `Patch before traffic increase` |

2. The system **raises a maintenance request automatically** (condition ≤ 2 or severity High). Because the asset is in DLP, the request is marked **Contractor liable (DLP) · Aarav Infra**, with a due date 7 days out (High).
3. Maintenance request `/maintenance/[id]`:
   1. **Rohit** → **Assign** → Harsh Vora (contractor).
   2. **Harsh** → **Start work**.
   3. **Harsh** → **Mark complete** with remarks `Patched 42 m²` and an after-repair photo.
   4. **Kiran** → **Verify repair** → condition after repair `4`. *Edge case:* **Reject — needs rework** sends it back to IN_PROGRESS.
   5. **Rohit** → **Close request**. The asset returns to OPERATIONAL and its condition and risk score update.
4. You can see all of this in:
   - Asset 360 → Timeline
   - `/dlp` → Liable defects
   - `/contractors/[id]` → DLP defects and fix time
   - Dashboard

### Step 10 — DLP & closure
1. Normally this happens after 24 months; for the demo you can do it straight away.
2. **Rohit** assigns the End-of-DLP inspection to Kiran and the retention-release task to himself.
3. Kiran submits `EDLP-31`, and Rohit submits `RR-31`. Meera accepts Rohit's task and Rohit accepts Kiran's.
4. **Meera** evaluates the gate → **Passed**.
5. The work becomes **CLOSED**, and the **contractor evaluation is computed automatically**: schedule 30, quality 30, rework 15, DLP 15, documentation 10. It appears on the work page and on `/contractors`.

---

## Part B — Register an existing asset directly (no work) · `/assets/new`
Use this for assets built before the system existed. Log in as Kiran, Rohit or Meera.

| Field | Value |
|---|---|
| Asset type | Bridge |
| Name | `Sabarmati Minor Bridge 7` |
| Sub-division | Daskroi |
| Latitude / Longitude | `22.9512` / `72.6034` (or **Use my location**) |
| Part of (parent code) | leave blank (for a component, enter the parent bridge code) |
| Structural importance | High |
| Traffic / usage | High |
| Lifecycle status | Operational |
| Commissioned on | `2012-06-01` |
| Original cost (₹) | `45000000` |
| Current condition | 3 · Moderate |

For a **road**, the form also asks for Road code (`DMO-AMD-32`) and start/end chainage (`12.0` / `18.5`).

After saving, the asset gets its code, risk score and QR code, and it appears on the map. From here the Part A **Step 9** loop applies: inspection → maintenance. It has no DLP, so the defect is the department's, not a contractor's.

To repair such an asset through a proper work, create a **Repair / rehabilitation** work. It skips the "asset to be created" section; instead you enter the asset code under *Assets to repair*. Its 5 stages run the same assign/submit/accept/gate loop. At the final gate you record the **Asset condition after repair**.

---

## Where to watch it all
- **Who has the file now** banner on the work page: current holder, days in stage, delay flag.
- 🔔 **Activity** (`/activity`): every hand-off with who → whom → time.
- **Asset 360 → Timeline**: every lifecycle event on the asset.
- **`/audit`** (HQ): the append-only audit log.
- **Dashboard / `/map`**: counts, risk bands, overdue items.
