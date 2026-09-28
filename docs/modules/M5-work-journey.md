# M5 — Work journey (M5a initiation & stage engine + M5b construction, handover, closure)

## What was built
- **Migration `005`:** `programmes`, `approval_limits` (illustrative: EE ≤ ₹2 Cr, HQ above), `work_templates` / `stage_templates` / `task_templates` (config), `works` extended (programme, template, current stage, initiation fields, tender ref, planned asset), `work_stages`, `work_tasks`, `stage_evaluations`, `work_approvals`, `contractor_evaluations`. All PRD 10.4 journey indexes; RLS on all.
- **Templates (config, `database/seed/work_templates.mjs`):** `NEW_ROAD` in full (8 stages, 26 tasks, checklists, milestone weights), `NEW_BRIDGE`, `NEW_BUILDING` (same spine, own milestones), `REPAIR_REHAB`, `EMERGENCY` (short paths).
- **Engine (`services/works.service.js`):**
  - *Initiate* (HQ, or EE for own division) from programme / directive / deposit request / field need / emergency → stages and tasks instantiated; initiator gets the initiation tasks. New-asset works carry a planned-asset spec; repair works link target assets.
  - *Tasks:* assign (responsible EE/HQ; contractor tasks only to the awarded contractor) → submit with **required deliverables** (+ progress photos via signed upload) → accept / return with remarks. Submitter ≠ reviewer.
  - *Gates:* pass / pass with observations / return (pick tasks) / reject. Checklist enforced; all mandatory tasks accepted first; **evaluator ≠ anyone who worked on the stage**; locked or closed stages → `409`.
  - *Stage effects:* DESIGN pass → **PLANNED asset created** with the pre-asset history back-filled; APPROVAL → TS + AA recorded, **cost-limit check** (EE blocked above ₹2 Cr → HQ); AWARD → contractor, value, dates, DLP; entering CONSTRUCTION → asset `UNDER_CONSTRUCTION` (or `UNDER_REHABILITATION` for repairs); milestone accept → progress rolls up by weight; HANDOVER → asset `OPERATIONAL`, commissioned, cost, `dlp_end_date`, origin work; CLOSURE → **explainable contractor evaluation** (schedule 30, quality 30, rework 15, DLP defects 15, documentation 10) and work `CLOSED`.
  - *Views:* who-has-the-file (holder, days in stage, delayed, next gate), pipeline by stage, My tasks (assigned / to review / gates I may evaluate, cost-limit aware).
- **API:** `GET /work-templates`, `GET /approval-limits`, `GET /contractors`, `GET/POST /programmes`, `GET/POST /works`, `GET /works/pipeline`, `GET /works/who-has-file`, `GET /works/:id` (= journey), `GET /works/:id/assignees`, `GET /tasks/mine`, `POST /tasks/:id/{assign,submit,accept,return}`, `POST /work-stages/:id/evaluate`.
- **Frontend:** `/works` (pipeline strip, filters, delayed flag, progress), `/works/new` (template cards, mandate, planned asset or target assets, escalation hint), `/works/[id]` (header facts, who-has-the-file callout, vertical stage tracker with tasks, deliverables, photos, gate decisions, gate modal with approval/award/handover fields, contractor evaluation card, sanctions), `/tasks` inbox, `/programmes` (allocated vs sanctioned vs contracted vs work done).
- **Seed (`06_work_history.mjs`):** 21 works — the hero bridge's full origin journey (Oct 2023 → handover Apr 2025 → in DLP), a hero new road mid-construction, a bridge **ready for the handover gate**, 3 awaiting award, a delayed survey, a returned design, an approval inside the EE limit, a fresh deposit-work initiation, a repair in execution, a closed emergency work, origin works for 9 in-DLP assets, 1 fully closed new road — 3 contractor evaluations.

## How to test
```bash
npm run migrate -w backend && npm run seed -w backend
cd backend && node --experimental-websocket scripts/smoke-m5.mjs   # 38 checks, full New Road journey
```
Live demo: Suresh Joshi (HQ, Secretary) → My tasks → "Completion & handover gate" on *Sanand minor bridge* → Evaluate → Passed + certificate ref → open the created asset → timeline from mandate to handover.
