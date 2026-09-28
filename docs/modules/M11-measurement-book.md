# M11 — Measurement book & running bills

## What was built (migration 010)
- **Bill of quantities** per work: item no., description, unit, quantity and rate. The EE/HQ maintain it until handover. Once an item has measurements, its **rate is locked** and it cannot be deleted.
- **Measurement book**: an entry records location, nos × L × B × D (or a quantity directly), the auto-computed quantity and amount, and the recorder's name and time.
  - Who records: the contractor holding the work, AEs of the division, or the EE/HQ, between award and handover.
  - Future dates are rejected.
  - If the cumulative quantity would exceed the BoQ, the entry needs a **deviation note** and is flagged as excess.
- **Independent check**: the checker is never the recorder. An AE test-checks the contractor's entries; the EE/HQ check anyone's. A rejection needs a reason. Two people checking at once cannot both succeed.
- **Running (RA) bills**:
  - The EE/HQ prepare a bill from all checked, unbilled entries.
  - **Cumulative billing can never exceed the contract value**; a variation must be sanctioned first.
  - A **second officer** approves or returns it. A returned bill releases its entries so they can be billed again.
  - Payment is recorded with a treasury/PFMS reference, and the contractor is notified.
  - An approved bill can be exported in a PFMS-style JSON (M13 adapter).
- **Screen** `/works/[id]/mb`, linked from the work journey page:
  - KPI tiles: BoQ value, measured %, awaiting check (and how many are yours), billed % of contract, paid.
  - Tabs: BoQ (progress per item, excess flags), Measurements (dimensions, recorded/checked by with timestamps), Bills (approve / return / record payment / PFMS export).
- Every action is audited and appears in the activity feed with a link to the book.

## Seeded demo
The Sanand–Dholka road (WK-2025-S002) has 8 BoQ items and 8 entries:
- one earthwork entry exceeds the BoQ, with a deviation note;
- one entry recorded by the contractor awaits the AE's test-check;
- one entry recorded by the AE awaits the EE;
- one checked entry is ready to bill.

It also has RA-1 (paid) and RA-2 (approved).

## How to test
`node --experimental-websocket scripts/smoke-m11.mjs` (35 checks). Writes happen only on WK-2026-S011, and the oversized test item is removed at the end.
