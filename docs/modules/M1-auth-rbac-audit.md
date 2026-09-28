# M1 — Auth, roles, jurisdiction, audit

## What was built
- **Roles (merged for the demo):** `HQ`, `EE`, `AE`, `CONTRACTOR` — see PRD 5.2 note.
- **Migration `002`:** `org_units` (materialised `path`, set by trigger), `contractors`, `users`, `audit_logs` (UPDATE/DELETE blocked by trigger). RLS enabled on all tables so Supabase's Data API cannot read them; only the Express API (DB owner connection) can.
- **Auth:** frontend signs in with Supabase Auth (publishable key). Backend `middleware/auth.js` verifies the JWT with `supabase.auth.getClaims`, loads the `users` profile, and caches it until token expiry (≤ 5 min).
- **RBAC:** `requireRole(...)` in `middleware/rbac.js` → `403`.
- **Jurisdiction:** `services/jurisdiction.service.js` — `applyJurisdictionScope(user, params, alias)` adds `path like '<user path>%'`; `assertOrgUnitInScope` for single records. HQ is unscoped.
- **Audit:** `services/audit.service.js` — `audit()` and `lifecycleEvent()` (table arrives in M2); both accept a transaction client so the trail commits with the change.
- **Validation:** `middleware/validate.js` (zod) → `400` with per-field details.
- **Endpoints:** `GET /me`, `GET /org-units`, `GET /org-units/:id`, `GET/POST /users`, `GET /audit-logs`.
- **Frontend:** `/login` with one-click demo accounts, role-aware sidebar (`lib/nav.ts`), user chip + sign out, route guard in `AppShell`, `/audit` page.
- **Seed:** 49 org units (1 state, 4 circles, 12 divisions, 32 sub-divisions), 2 contractors, 8 demo users. Password `GujInfra@2026` (override with `DEMO_PASSWORD`).

## How to test
```bash
npm run migrate -w backend
npm run seed -w backend
npm run dev
cd backend && node --experimental-websocket scripts/smoke-m1.mjs   # 17 API checks
```
The smoke test creates one "Smoke Test AE" user per run (visible in the audit log).

## Notes
- Node 20 needs `--experimental-websocket` for supabase-js 2.109 (already in the backend scripts). Node 22+ does not.
