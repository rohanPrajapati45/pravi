# M13 — Citizen complaints & integration adapters

## Citizen side (no login)
- **`/complain`** (the login page links to it): choose the problem, describe it, then share GPS, describe the place or enter the asset code from the board. `?asset=CODE` prefills the code, so a QR on the board can link straight here. Up to 3 photos go to private storage through a one-time slot. Name and mobile are optional.
- **`/complain/track`**: enter the complaint number and the last 4 digits of the mobile number to see a timeline — received → acknowledged → repair scheduled (with the MR code and target date) → resolved (with the officer's note). The tracking page shows no personal data, and wrong digits return a 404.
- The public endpoints are rate-limited per IP (10 complaints and 12 photo slots per 10 minutes) and validate that the point lies within Gujarat's bounding box.

## Routing & matching
1. If an asset code is given, that asset wins.
2. Otherwise the nearest *likely* asset: categories map to asset types (pothole → road, bridge damage → bridge/culvert…). The distance is measured to the **road's line**, not its midpoint, within 500 m, or 200 m for any other asset type.
3. Otherwise the nearest office within 10 km.
4. Otherwise the **HQ routing queue**.

The routed AE and EE are alerted; an unrouted complaint alerts HQ.
**Duplicates:** the same category on the same asset within 14 days is linked to the open complaint and marked DUPLICATE, so officers see one issue with "+N same issue".

## Officer side (`/complaints`, `/complaints/[id]`)
- Lanes: needs action, repair under way, resolved, rejected/duplicate. Filters: category and, for HQ, unrouted only. Phone numbers are masked in lists.
- Actions:
  - **Acknowledge**.
  - **Link asset**: pick from the nearest candidates with distances, or enter a code. Linking re-routes the complaint and alerts the new office.
  - **Take up for repair**: raise a new maintenance request with source COMPLAINT, or follow an already-open one on the asset.
  - **Resolve** or **Not actionable**, each with a note for the citizen.
- **Automatic sync**: closing the repair request resolves its complaints ("Repaired under MR-…"); cancelling it hands them back to ACKNOWLEDGED.
- The Asset 360 **Complaints** tab lists every complaint on the asset, and the repair request page lists its complaints.

## Integration adapters (Administration → Jobs & integrations)
| Adapter | Direction | Endpoint |
|---|---|---|
| CPGRAMS, SWAGAT | Inbound | `POST /api/v1/integrations/{cpgrams|swagat}/complaints` with header `x-integration-key` |
| PFMS / IFMS | Outbound | `GET /api/v1/integrations/pfms/bills/:id` (approved bills; EE/HQ) |
| GIS | Outbound | `GET /api/v1/integrations/gis/assets.geojson` (caller's jurisdiction, EPSG:4326) |

- **Inbound adapters:**
  - They are **disabled until `INTEGRATION_API_KEY` is set** on the API server; until then they answer 503. The key is compared in constant time.
  - A portal's free-text category is mapped to ours.
  - Imports are **idempotent** on (channel, grievance number), so a portal retry returns the same complaint.
- Every call — accepted, rejected or failed — is logged and shown with 24-hour counts.

## How to test
`node --experimental-websocket scripts/smoke-m13.mjs` (30 checks; the inbound checks adapt to whether the key is set).
