# M2 — Asset registry & Asset 360

## What was built
- **Migration `003`:** `asset_types` (config: category, `attribute_schema`, inspection interval, design life, code prefix), `assets` (all PRD 10.4 indexes + trigram indexes for search), minimal `works`, `work_assets`, append-only `lifecycle_events`. RLS on all.
- **Risk engine** (`services/risk.engine.js`, pure): PRD 9.1 factors with per-factor points and human labels, bands, and 9.2 recommendations. Pulled forward from M6 because Asset 360 and M3 need it. History factor activates automatically once `maintenance_requests` exists.
- **Workflow engine** (`services/workflow.service.js`): config map `{from: {to: {roles, requires}}}`; invalid transitions → `409`. `assetMachine` implements PRD 7.1. `transitionAssetStatus()` is shared with M4/M5 (role `SYSTEM`).
- **API:** `GET /asset-types`, `GET /assets` (q, type, category, district, org unit subtree, status, condition, risk band, overdue, in DLP, parent; sort; paginated), `GET /assets/lookup?code=` (asset code or QR token), `GET /assets/:id`, `/360`, `/timeline`, `/children`, `POST /assets`, `PATCH /assets/:id` (AE limited to name/attributes/location), `POST /assets/:id/status`.
- **Rules:** assets belong to a sub-division in the caller's jurisdiction; road segments require road code + chainage; attributes validated against the type schema; retired assets are read-only; every create/edit/status change writes a lifecycle event + audit row in the same transaction.
- **Frontend:** `/assets` (filters, debounced search, server pagination), `/assets/new` (type-driven dynamic form, GPS button, parent lookup), `/assets/[id]` Asset 360 (header with status/condition/DLP/overdue, risk "why?" breakdown, suggested next step, identity/location/origin/condition/people cards, tabs: Timeline, Components, Inspections, Maintenance, Documents, Complaints; edit + status-change modals).
- **Seed:** 8 asset types; 500 deterministic fake assets (1 hero bridge `RDB-BR-000001` in DLP, 300 road segments with chainage + line geometry, 30 bridges, 45 culverts, 40 buildings, 35 child equipment, 49 streetlight runs); ~20 in DLP (5 expiring < 30 days); 28 overdue inspections; varied lifecycle statuses.

## How to test
```bash
npm run migrate -w backend && npm run seed -w backend
cd backend && node --experimental-websocket scripts/smoke-m2.mjs   # 28 API checks
```
UI: sign in as EE Ahmedabad → Assets → filter/search → open `RDB-BR-000001` → "why?" on the risk badge → Components/Timeline tabs → Edit → Change status.
