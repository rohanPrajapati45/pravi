# M4 — Maintenance workflow

## What was built
- **State machine** (`maintenanceMachine` in `services/maintenance.service.js`, PRD 7.4): `OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED`, reject (`COMPLETED → IN_PROGRESS`, remarks, `rejection_count++`), cancel (`OPEN/ASSIGNED → CANCELLED`, remarks). Role rules live in the machine config; person rules are enforced in the service:
  - assign: EE/HQ; assignee must be an AE in the asset's division or a contractor user;
  - start / complete: only the assignee; complete needs remarks + ≥1 after-photo (`maintenance/<request_id>/…`);
  - verify / reject: EE or AE who is **neither the assignee nor the completer**;
  - close: EE/HQ with actual cost.
- **Asset automation:** start → asset `UNDER_MAINTENANCE`; verify → asset condition = verified rating, back to `OPERATIONAL` (unless another job is in progress), risk recomputed; every step writes an audit row and an asset lifecycle event, in one transaction.
- **DLP:** requests on assets in DLP are `dlp_liable`, contractor prefilled from the origin work; the assign dialog lists the liable contractor first.
- **Overdue:** derived (`due_date < today` while OPEN/ASSIGNED/IN_PROGRESS); sorted to the top of every list.
- **Contractor scope:** contractors see only requests for their firm or assigned to them.
- **Refactor:** inspections now call the shared `createRequestRecord()`.
- **API:** `GET/POST /maintenance-requests`, `GET /maintenance-requests/summary`, `GET /maintenance-requests/:id` (history, before/after photos, `allowed_actions` for the caller), `GET /:id/assignees`, `POST /:id/{assign,start,complete,verify,reject,close,cancel}`.
- **Frontend:** `/maintenance` board (KPI tiles, status lanes with counts, filters: mine / overdue / DLP / severity / search), `/maintenance/[id]` (progress stepper, evidence before/after, history, action panel showing only allowed actions with the right form per step), Asset 360 "Request repair".
- **Seed:** 61 requests across all statuses (10 overdue, 9 DLP-liable) in Ahmedabad/Surat divisions + a few open elsewhere; assets with in-progress work set `UNDER_MAINTENANCE`; a closed DLP repair on the hero bridge.

## How to test
```bash
npm run seed -w backend
cd backend && node --experimental-websocket scripts/smoke-m4.mjs   # 27 API checks
```
UI chain: EE Rohit → Maintenance → an Open request → Assign to Kiran → sign in as Kiran → Start → Mark complete (photo) → sign in as Rohit → Verify (rating 4) → Close.
