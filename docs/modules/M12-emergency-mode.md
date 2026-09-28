# M12 — Emergency mode

## What was built (migration 011)
- **Declare**:
  - HQ can declare for the state, a circle or a division. An EE can declare only within their own division.
  - Every HQ/EE/AE whose office overlaps the area gets a **critical alert**, and a red **emergency banner** shows on every page until the emergency closes.
- **Report damage** (AE/EE/HQ): enter the asset code, describe the damage, choose severity (minor / major / severe) and traffic status (open / restricted / closed), and add up to 3 photos. In one transaction this:
  - closes the asset to traffic when the status is *closed* (the asset becomes `CLOSED_TEMPORARILY`);
  - raises an **urgent maintenance request** with source EMERGENCY, due in 1 day if severe and 3 if major;
  - recomputes risk;
  - writes timeline events and alerts the division EE.

  A report is rejected if the asset is outside the emergency area or already reported under this emergency.
- **Fast-track work** (EE/HQ): creates a work from the **Emergency** template — immediate action first, estimate and approval recorded after the fact, then repair and close — with CRITICAL priority, linked to the damage report.
- **Restore** (a remark is required): the asset reopens to traffic, and the Asset 360 timeline shows reported → closed → reopened.
- **Close** (HQ, or the EE who declared it): if any asset is not yet restored, closing needs a remark explaining how they are being handled.
- Repair requests show *"Raised under emergency EMG-…"*.
- Screens: `/emergencies` (active and past emergencies, **Declare**) and `/emergencies/[id]` (KPIs and the damaged-asset list with repair and work links, photos, restore and fast-track actions).
- Seeded history: a closed heavy-rain emergency in Olpad with 2 restored assets.

## How to test
`node --experimental-websocket scripts/smoke-m12.mjs` (25 checks). The test runs in the Surat division, then closes the emergency and cancels its repair.
