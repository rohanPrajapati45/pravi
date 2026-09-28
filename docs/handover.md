# Handover guide — GujInfra 360

For the department's **system administrator** (runs the app) and **IT cell** (runs the infrastructure). Evaluators: the first section explains the whole application in one page.

---

## 1. What the application is

One web application in three layers:

```
 Browser / phone ──HTTPS──▶ Web app (Vercel)  ── screens only, no secrets, no data
                                   │  REST + login token
                                   ▼
                            API (Render)       ── every rule: roles, office scope, workflows,
                                   │              risk, validation, audit trail
                                   ▼
                 Supabase: PostgreSQL · Auth (logins) · Storage (photos)
```

- The **API is the only way to the data**: Supabase's public data access is disabled (row-level security with no policies), so the web app cannot read or write tables directly.
- The browser talks to Supabase only to **sign in** and to **upload a photo** using a one-time token the API issued.
- The layers deploy and scale independently; together they are one system with one database.

## 2. Two kinds of administrator

| | Department administrator (in the app) | Technical administrator (IT cell / vendor) |
|---|---|---|
| Who | HQ officer with the HQ role | IT staff |
| Where | **Administration** in the sidebar (`/admin`) | Vercel, Render and Supabase dashboards, GitHub |
| Does | Users, offices, asset types, approval limits, contractors; reviews audit log and activity | Hosting, backups, secrets, monitoring, deploying new versions |
| Needs a developer | No — everything is configuration | Only for new features or integrations |

### Administration console (`/admin`, HQ only, every change audited)

| Tab | Use it to |
|---|---|
| **Users** | Create accounts (role + office decide what a person sees), transfer between offices, change designation, **deactivate** leavers (blocked at the API and at sign-in immediately; history kept), reset passwords |
| **Offices** | Maintain State → Circle → Division → Sub-division; add a new division or sub-division |
| **Asset types** | Add a new kind of asset (e.g. water pumps) and its form fields; set inspection interval and design life — no code change |
| **Approval limits** | Set the EE's financial limit; works above it escalate to HQ at the Approvals gate |
| **Contractors** | Register firms, see active works, average evaluation score and open defect-liability items; deactivate a firm |
| **Work templates** | Read the stage → task → gate definition of each work type (editing is on the roadmap) |
| **System** | Health, record counts, applied database migrations, recompute risk |

Rules the system enforces: role must match office level (HQ at State/Circle, EE at Division, AE at Sub-division); an administrator cannot deactivate or demote their own account; the last active HQ administrator cannot be removed.

## 3. Handover-day procedure (fresh installation)

1. **Create the department's Supabase project** (Mumbai region). Note URL, publishable key, secret key and the *Session pooler* connection string.
2. **Configure Render and Vercel** with those values (see README → Run it, and `render.yaml`).
3. **Load configuration only — no demo data:**
   ```bash
   npm run migrate -w backend
   npm run seed:production -w backend     # offices, asset types, work templates, approval limits
   ```
   Edit `database/seed/01_org_users.mjs` (office list) and `work_templates.mjs` / approval limits beforehand if the department's structure or delegation differs.
4. **Create the first administrator** (the only step that needs a terminal):
   ```bash
   npm run create-admin -w backend -- --email admin@<dept-domain> --name "System Administrator"
   ```
   It prints a temporary password. The administrator signs in and changes it.
5. The administrator creates EE, AE and contractor accounts from **Administration → Users**.
6. Remove demo accounts from Supabase Auth if the demo project is being reused.

## 4. Day-to-day operations (IT cell)

| Task | How |
|---|---|
| Deploy a new version | Merge to `main` on GitHub → Vercel and Render redeploy automatically; Render runs new database migrations during the build |
| Roll back | Vercel: "Promote" a previous deployment. Render: "Rollback" to a previous deploy. (Migrations are additive; review before rolling back across one.) |
| Backups | Supabase daily backups (enable Point-in-Time Recovery on a paid plan); export with `pg_dump` for off-site copies |
| Rotate secrets | Supabase → API keys → roll the secret key; update `SUPABASE_SECRET_KEY` on Render. The publishable key is public by design |
| Health | `GET /api/v1/health` (Render health check); Administration → System |
| Who did what | Administration → System → Audit log (append-only; database rejects edits) |
| Test after changes | `npm run test:smoke -w backend` against a **non-production** project (it creates test records) |

## 5. Data ownership and portability

- All data lives in the department's own PostgreSQL database; files in its own storage bucket.
- The stack is standard: PostgreSQL + S3-compatible storage + token-based login. It can move to a state data centre, and sign-in can move to the state's single sign-on, without changing business logic.
- External systems (GRMS, IFMS, IWDMS, e-Procurement) are to be connected through adapters that share asset and work codes, not by copying their data.

## 6. What needs a developer

New modules (GIS map, documents, complaints…), editing workflow templates from the UI, changes to workflow rules, and live integrations.
