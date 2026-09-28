# M3 — Inspections & condition

## What was built
- **Migration `004`:** `inspections` (code `INS-YYYY-NNNNNN`, GPS + accuracy, distance from the registered location, photo paths, review fields) and `maintenance_requests` (created now because inspections raise them; M4 adds the workflow).
- **Photo evidence (Supabase Storage):** private `evidence` bucket (5 MB, JPEG/PNG/WebP). `POST /uploads/sign` checks the caller can see the asset, then returns a one-time signed upload token; the browser compresses to ≤1600 px JPEG and uploads directly. Reads use 1-hour signed URLs. Submitted paths must belong to that asset (`inspection/<asset_id>/…`).
- **Submit (one transaction, PRD 7.3):** insert inspection → update asset condition / last inspected / next due (`+ type interval`) → if rating ≤ 2 or severity HIGH, raise a maintenance request (or link the open one — no duplicates), marked **DLP-liable** with the original contractor prefilled when the asset is in DLP → recompute risk (history factor now counts open high defects) → lifecycle events + audit.
- **API:** `POST /inspections` (EE, AE), `GET /inspections` (scoped; `asset_id`, `mine`, `severity`), `GET /inspections/overdue`, `GET /inspections/:id`, `POST /inspections/:id/review` (EE/HQ, not the inspector), `GET /assets/:id/condition-history`, `GET /assets/:id/maintenance`, `POST /uploads/sign`.
- **Frontend:** `/inspections/new` mobile-first (asset code/QR lookup, live GPS chip, 5 large condition buttons, severity chips, defect quick-picks per category + custom, camera photos, sticky submit, outcome screen showing condition/risk before→after and the auto-raised request); `/inspections` (Overdue queue with Inspect buttons, Recent inspections); Asset 360 Inspect button, Inspections tab with Recharts condition trend + photo thumbnails, Maintenance tab.
- **Seed:** 2–5 historical inspections per asset trending toward current condition (only after commissioning), with lifecycle events; evidence bucket created.
- **M2 UI fixes:** no `<button>` inside `<a>` (`ButtonLink`), risk "why?" popover anchored right on desktop + closes on outside click/Escape, sidebar sticky on desktop, asset filters collapse behind a "Filters" button on phones.

## How to test
```bash
npm run migrate -w backend && npm run seed -w backend
cd backend && node --experimental-websocket scripts/smoke-m3.mjs   # 25 API checks
```
UI (phone width): sign in as Kiran Solanki (AE) → Inspections → Overdue → Inspect, or New inspection → `RDB-BR-000001` → rate 2 → add a photo → submit.
