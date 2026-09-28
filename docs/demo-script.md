# Demo script — GujInfra 360 (≈ 7 minutes)

Prep: run `npm run db:reset -w backend` before the demo (clean, deterministic data), then `npm run dev`. Open two windows: a desktop browser and a phone-width window (DevTools → 390 px) for the field steps. Every login is one click on the login page. The **Activity** page (bell icon) shows each hand-off with exact timestamps — keep it open in a tab to prove the flow.

| # | Time | Login | Do this | Say this |
|---|---|---|---|---|
| 1 | 0:00 | — (login page) | Show the left panel. | Assets outlive projects, but their information is scattered across systems; once a project closes the asset is forgotten, and maintenance is reactive. |
| 2 | 0:30 | — | — | We are **not replacing** GRMS / IFMS / IWDMS / e-Procurement. This is an asset-centric lifecycle and integration layer: one identity, one timeline, decisions instead of records. |
| 3 | 0:50 | **Meera Desai (HQ)** | Dashboard → KPI row → click **why?** on the #1 priority asset → condition-by-district chart → works pipeline. | Every priority explains itself — condition, criticality, traffic, age, overdue inspection, repair history. Weights are illustrative and configurable; the officer decides. |
| 4 | 1:50 | Meera | Top search box: `RDB-BR-000001` → Asset 360 → **Timeline** tab. Point at the DLP badge and "How it came to exist". | This bridge's history starts with the **government directive in 2023** — survey, a DPR returned once, sanction, award, construction with a milestone reworked, handover in 2025, then inspections, a defect and a verified repair. |
| 5 | 2:50 | **Kiran Solanki (AE)** — phone width | Inspections → **+ New inspection** → `RDB-BR-000001` → tap **2 (Poor)** → pick *Expansion joint damage* → add a photo → **Submit**. | Under a minute on a phone, GPS captured automatically, photo uploaded straight to storage. |
| 6 | 3:30 | Kiran | Result screen: condition and risk before → after; **maintenance request raised automatically**, marked **contractor-liable (DLP)**. | Zero manual steps: a poor inspection becomes a tracked request, routed to the contractor who built it because it is still in its defect liability period. |
| 7 | 3:50 | **Rohit Parmar (EE)** | Bell shows the new request → open it → **Assign** (the liable contractor is listed first). | |
| 8 | 4:10 | **Harsh Vora (Contractor)** | Maintenance → the job → **Start work** → **Mark complete** with an after-photo. | The asset is automatically *under maintenance* while work is on. |
| 9 | 4:40 | **Kiran (AE)** | Open the request → **Verify repair**, rating 4. | The verifier can never be the person who did the work — enforced by the server. Asset returns to operational; risk drops. |
| 10 | 5:00 | Rohit | **Close** with actual cost ₹0 (borne by contractor). Open the asset timeline. | Every step is on the asset's permanent, append-only timeline. |
| 11 | 5:20 | Rohit | Works → *Sanand–Dholka link road* → "Who has the file now" → Construction stage → **Accept** the submitted *Base course* milestone. | Every work runs stage → task → gate from a template; progress rolls up from accepted milestones. |
| 12 | 5:50 | **Suresh Joshi (HQ, Secretary)** | My tasks → *Completion & handover* gate on **Sanand minor bridge** → **Evaluate** → Passed + certificate ref → open the created asset. | Handover **creates the asset** — operational, DLP started, contractor and cost attached, with its whole journey from mandate to handover already on its timeline. |
| 13 | 6:20 | Rohit (optional) | My tasks → *Approvals* gate on **Sanand Sub-division Office** (₹1.55 Cr) → pass. Then show the road work where ₹12 Cr needed HQ. | Delegation of financial powers is configuration: EE up to ₹2 Cr, above escalates — enforced at the gate. |
| 14 | 6:35 | any | Activity page. | Who did what, to whom, when — to the second. |
| 15 | 6:45 | — | README "Scaling" table. | Stateless API, path-indexed jurisdiction, pagination everywhere, set-based jobs (524 assets rescored in < 1 s), Redis/BullMQ, read replicas, object storage, adapter-based integrations. |
| 16 | 7:00 | — | — | **One identity, one timeline, decisions instead of records.** |

## Backup facts
- Tests: `npm run test:smoke -w backend` — ~170 API checks (auth scope, 403/409 rules, auto-raise, DLP routing, full New Road journey, dashboard parity with DB).
- Closed work with a contractor score: Works → *Include closed* → the *Construction of DMO-AMD-05…* road (score shown with reasons).
- Evaluator questions to ask up front: see PRD §18.
