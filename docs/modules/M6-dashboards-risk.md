# M6 — Dashboards & risk

## What was built
- **Risk engine** (built in M2, `services/risk.engine.js`): PRD 9.1 factors with per-factor points + labels, bands, 9.2 recommendations. Recomputed synchronously on every relevant event (asset edit, inspection, maintenance verify/cancel, handover).
- **Bulk recompute** `POST /risk/recompute` (HQ): one read with history aggregates, scoring in memory, one set-based `UPDATE … FROM jsonb_to_recordset` — 524 assets in < 1 s. At state scale this is the nightly BullMQ job.
- **API:** `GET /dashboard/summary` (assets by band, overdue inspections, DLP, maintenance backlog / unassigned / to verify / overdue / DLP-liable, works active / delayed / sanctioned / contracted, my tasks; contractor evaluations), `GET /dashboard/priority-assets` (ranked, with factors + suggested action + open requests), `GET /dashboard/condition-distribution` (by district for HQ, by sub-division otherwise). Every number uses the same jurisdiction scope as the lists.
- **Role dashboards (`/`):**
  - HQ — KPI row, top-10 priority assets with "why?", risk profile, works pipeline by stage, condition by district, programmes sanctioned vs allocation, delayed works, recompute button.
  - EE — division KPIs (repairs to assign), priority list, "My desk" (tasks / reviews / gates), pipeline, condition by sub-division, delayed works, awaiting verification.
  - AE — my area KPIs (repairs assigned to me), top-5 priority, inspections due with Inspect buttons, my repairs, my work tasks.
  - Contractor — active works, milestones to submit, DLP-liable defects, evaluation results.
- KPI tiles deep-link to filtered lists (`/assets?risk_band=CRITICAL`, `/assets?in_dlp=true`, `/works?stage=…`).

## How to test
```bash
cd backend && node --experimental-websocket scripts/smoke-m6.mjs   # 19 checks incl. DB count parity
```
