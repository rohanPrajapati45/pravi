# M9 — Contractors & DLP

## What was built
- **DLP tracker API:** `GET /dlp/summary` (in DLP, ending ≤ 30 days, ended in last 90 days, liable defects open/overdue/fixed, average fix time), `GET /dlp/assets?bucket=active|expiring|expired&days=30` (asset, origin work, liable contractor, days remaining, share of DLP elapsed, liable defects open/total), `GET /dlp/expiring` (PRD alias). Scoped like the asset list; AE, EE and HQ can read it.
- **Contractor performance API:** `GET /contractors/performance` and `GET /contractors/:id/performance`. Metrics are computed **only over works and defects inside the caller's jurisdiction**: active/completed works and value, on-time completion %, average delay, works running past planned end, first-pass milestone %, average closure score, DLP defects raised/open and average fix time; detail adds the works list, every closure evaluation with its explained components, and the liable-defect list. HQ/EE see all active firms; **a contractor sees only their own firm** (other firm → 403); AE → 403.
- **Screens:**
  - `/dlp` — KPI tiles; tabs *In DLP*, *Ending soon* (with an **End-of-DLP inspection** button for AE/EE), *Liable defects* (the contractor-liable queue), *Recently ended*; progress bar of DLP elapsed; links to asset, work and contractor.
  - `/contractors` — firm cards with score, active/completed works, on-time %, delay, first-pass %, DLP defects; running-late and open-defect flags.
  - `/contractors/[id]` — KPI tiles, works table (schedule vs actual, delay, progress), liable defects, closure evaluations with component bars and reasons. Contractors reach it as **My performance**.
- Dashboard "Assets in DLP" tile now opens the DLP tracker. No migration and no new dependencies.

## How to test
```bash
cd backend && node --experimental-websocket scripts/smoke-m9.mjs   # 20 read-only checks
```

## DoD
DLP-liable requests reach the liable contractor's view ✔ · DLP-expiring-soon list correct (only ≤ 30 days, matches DB) ✔ · performance scoped by jurisdiction ✔ · contractor isolation ✔.
