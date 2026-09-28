import { timingSafeEqual } from "node:crypto";
import { query } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { listAssetsGeo } from "./assets.service.js";
import { CATEGORIES, intakeComplaint } from "./complaints.service.js";
import { getBill } from "./measurement.service.js";
import { canManage } from "./works.service.js";

// Adapter registry. Inbound adapters accept grievances pushed by external portals; outbound ones export our data
// in the shape another system expects. Each call is logged so the admin can see what crossed the boundary.
export const ADAPTERS = {
  cpgrams: { name: "CPGRAMS", description: "Central public grievance portal — grievances pushed in as complaints", direction: "INBOUND", channel: "CPGRAMS" },
  swagat: { name: "SWAGAT", description: "Gujarat CM's grievance portal — grievances pushed in as complaints", direction: "INBOUND", channel: "SWAGAT" },
  pfms: { name: "PFMS / IFMS", description: "Approved running bills exported in a payment-system format", direction: "OUTBOUND" },
  gis: { name: "GIS (GeoJSON)", description: "Asset layer for state GIS / BISAG portals", direction: "OUTBOUND" }
};

export async function logIntegration(adapter, direction, status, reference, message) {
  await query("insert into integration_logs (adapter, direction, status, reference, message) values ($1, $2, $3, $4, $5)", [
    adapter,
    direction,
    status,
    reference ?? null,
    message?.slice(0, 500) ?? null
  ]);
}

const inboundKey = () => process.env.INTEGRATION_API_KEY ?? "";

function keyMatches(given) {
  const expected = Buffer.from(inboundKey());
  const actual = Buffer.from(given ?? "");
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Portals send free-text categories; map the common ones and keep the original text in the description.
function mapCategory(text = "") {
  const value = text.toUpperCase().replace(/[^A-Z]+/g, "_");
  if (CATEGORIES.includes(value)) return value;
  if (/POTHOLE/.test(value)) return "POTHOLE";
  if (/BRIDGE|CULVERT/.test(value)) return "BRIDGE_DAMAGE";
  if (/DRAIN/.test(value)) return "DRAINAGE";
  if (/WATER|FLOOD/.test(value)) return "WATERLOGGING";
  if (/LIGHT/.test(value)) return "STREETLIGHT";
  if (/SIGN/.test(value)) return "SIGNAGE";
  if (/BUILDING|OFFICE/.test(value)) return "BUILDING";
  if (/ROAD/.test(value)) return "ROAD_DAMAGE";
  return "OTHER";
}

export async function receiveGrievance(adapterKey, apiKey, payload) {
  const adapter = ADAPTERS[adapterKey];
  if (!adapter || adapter.direction !== "INBOUND") throw AppError.notFound("Unknown inbound adapter");
  if (!inboundKey()) throw new AppError(503, "INTEGRATION_DISABLED", "Inbound integrations are disabled — set INTEGRATION_API_KEY on the API server");
  if (!keyMatches(apiKey)) {
    await logIntegration(adapterKey, "INBOUND", "REJECTED", payload?.reference, "Invalid or missing x-integration-key");
    throw AppError.unauthorized("Invalid integration key");
  }
  // Portals retry; the same grievance number is imported only once.
  const { rows } = await query("select complaint_code, status from complaints where channel = $1 and external_ref = $2", [adapter.channel, payload.reference]);
  if (rows[0]) {
    await logIntegration(adapterKey, "INBOUND", "OK", payload.reference, `Already imported as ${rows[0].complaint_code}`);
    return { complaint_code: rows[0].complaint_code, status: rows[0].status, duplicate: true };
  }
  try {
    const complaint = await intakeComplaint(
      {
        category: mapCategory(payload.category),
        description: payload.category && mapCategory(payload.category) === "OTHER" ? `[${payload.category}] ${payload.description}` : payload.description,
        location_text: payload.location,
        lat: payload.lat,
        lng: payload.lng,
        citizen_name: payload.name,
        citizen_phone: payload.phone,
        asset_code: payload.asset_code
      },
      { channel: adapter.channel, externalRef: payload.reference }
    );
    await logIntegration(adapterKey, "INBOUND", "OK", payload.reference, `Imported as ${complaint.complaint_code}${complaint.asset_id ? "" : " (not matched to an asset)"}`);
    return { complaint_code: complaint.complaint_code, status: complaint.status, routed: Boolean(complaint.org_unit_id), duplicate: false };
  } catch (error) {
    await logIntegration(adapterKey, "INBOUND", "ERROR", payload.reference, error.message);
    throw error;
  }
}

// PFMS-style payload for an approved bill: payee, sanction and amount, ready for the payment system.
export async function exportBillToPfms(user, billId) {
  const { bill, work, entries } = await getBill(user, billId);
  if (!canManage(user, work)) throw AppError.forbidden("Only the responsible EE or HQ exports bills");
  if (!["APPROVED", "PAID"].includes(bill.status)) {
    await logIntegration("pfms", "OUTBOUND", "REJECTED", `${work.work_code}/RA-${bill.bill_no}`, `Bill is ${bill.status}`);
    throw AppError.invalidTransition("Only approved bills can be sent for payment");
  }
  const [{ rows: firm }, { rows: approvals }] = await Promise.all([
    query("select code, name from contractors where id = $1", [work.contractor_id]),
    query("select stage, reference from work_approvals where work_id = $1 and decision = 'APPROVED' order by decided_at", [work.id])
  ]);
  const reference = (stage) => approvals.filter((row) => row.stage === stage).at(-1)?.reference ?? null;
  await logIntegration("pfms", "OUTBOUND", "OK", `${work.work_code}/RA-${bill.bill_no}`, `₹${bill.amount} exported by ${user.name}`);
  return {
    format: "PFMS-EAT-v1 (illustrative)",
    generated_at: new Date().toISOString(),
    bill_reference: `${work.work_code}/RA-${bill.bill_no}`,
    scheme: work.programme_code ?? "NON-PLAN",
    sanction: { technical: reference("TECHNICAL_SANCTION"), administrative: reference("ADMIN_APPROVAL"), amount: work.sanctioned_amount },
    tender: work.tender_ref ?? null,
    payee: firm[0] ? { code: firm[0].code, name: firm[0].name } : null,
    gross_amount: bill.amount,
    cumulative_amount: bill.cumulative_amount,
    status: bill.status,
    payment_ref: bill.payment_ref,
    measurement_entries: entries.map((entry) => ({ entry_no: entry.entry_no, item_no: entry.item_no, quantity: entry.quantity, unit: entry.unit, rate: entry.rate, amount: entry.amount }))
  };
}

export async function exportGis(user) {
  const collection = await listAssetsGeo(user, {});
  await logIntegration("gis", "OUTBOUND", "OK", null, `${collection.features.length} features exported by ${user.name}`);
  return { ...collection, meta: { ...collection.meta, crs: "EPSG:4326", source: "GujInfra 360", generated_at: new Date().toISOString() } };
}

export async function integrationStatus() {
  const [stats, logs] = await Promise.all([
    query(
      `select adapter, count(*) filter (where created_at > now() - interval '24 hours')::int as calls_24h,
              count(*) filter (where status <> 'OK' and created_at > now() - interval '24 hours')::int as failures_24h,
              max(created_at) as last_call_at
         from integration_logs group by adapter`
    ),
    query("select * from integration_logs order by created_at desc limit 30")
  ]);
  const byAdapter = Object.fromEntries(stats.rows.map((row) => [row.adapter, row]));
  return {
    adapters: Object.entries(ADAPTERS).map(([key, adapter]) => ({
      key,
      ...adapter,
      enabled: adapter.direction === "OUTBOUND" || Boolean(inboundKey()),
      endpoint:
        adapter.direction === "INBOUND"
          ? `POST /api/v1/integrations/${key}/complaints  (header x-integration-key)`
          : key === "pfms"
            ? "GET /api/v1/integrations/pfms/bills/:billId"
            : "GET /api/v1/integrations/gis/assets.geojson",
      calls_24h: byAdapter[key]?.calls_24h ?? 0,
      failures_24h: byAdapter[key]?.failures_24h ?? 0,
      last_call_at: byAdapter[key]?.last_call_at ?? null
    })),
    logs: logs.rows
  };
}
