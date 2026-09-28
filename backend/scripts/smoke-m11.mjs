// M11 measurement book & bills smoke test: node --experimental-websocket scripts/smoke-m11.mjs
// Reads the seeded Sanand–Dholka book; writes only "SMK-" items on the bearing-replacement work (WK-2026-S011).
import pg from "pg";
import { call, check, login, summary } from "./_client.mjs";

const hq = await login("hq@gujinfra.example");
const ee = await login("ee.ahmedabad@gujinfra.example");
const nisha = await login("ae.sanand@gujinfra.example");
const pooja = await login("ae.olpad@gujinfra.example");
const aarav = await login("contractor.aarav@gujinfra.example");
const kaveri = await login("contractor.kaveri@gujinfra.example");

const find = async (q) => (await call(hq, `/works?q=${encodeURIComponent(q)}&limit=1&active=false`)).body.data[0];
const road = await find("Sanand–Dholka");
const book = (await call(ee, `/works/${road.id}/mb`)).body.data;
check("Seeded book: 8 BoQ items, 8 entries, 2 bills", book.items.length === 8 && book.entries.length === 8 && book.bills.length === 2);
check("Excess over BoQ flagged on earthwork", book.items.find((item) => item.item_no === "2.01")?.excess === true);
check("One checked entry awaits billing; EE may prepare a bill", book.totals.unbilled_entries === 1 && book.permissions.bill === true);
const pending = book.entries.find((entry) => entry.status === "RECORDED" && entry.recorded_by_role === "CONTRACTOR");
const nishaBook = (await call(nisha, `/works/${road.id}/mb`)).body.data;
check("AE may test-check the contractor's entry", nishaBook.entries.find((entry) => entry.id === pending.id)?.actions.includes("check"));
const own = nishaBook.entries.find((entry) => entry.recorded_by_name === "Nisha Chauhan" && entry.status === "RECORDED");
check("AE cannot check her own entry", own && own.actions.length === 0);
check("Holding contractor sees the book", (await call(aarav, `/works/${road.id}/mb`)).status === 200);
check("Other contractor -> 403", (await call(kaveri, `/works/${road.id}/mb`)).status === 403);
check("Other division's AE -> 403", (await call(pooja, `/works/${road.id}/mb`)).status === 403);

// ---- write path on WK-2026-S011 ----
const work = await find("WK-2026-S011");
const tag = `SMK-${Date.now() % 100000}`;
check("AE cannot edit the BoQ -> 403", (await call(nisha, `/works/${work.id}/boq`, { method: "POST", body: { item_no: tag, description: "Smoke item", unit: "sqm", quantity: 100, rate: 500 } })).status === 403);
const item = await call(ee, `/works/${work.id}/boq`, { method: "POST", body: { item_no: tag, description: "Smoke test deck patching", unit: "sqm", quantity: 100, rate: 500 } });
check("EE adds a BoQ item", item.status === 201);
check("Duplicate item number -> 400", (await call(ee, `/works/${work.id}/boq`, { method: "POST", body: { item_no: tag, description: "Again", unit: "sqm", quantity: 1, rate: 1 } })).status === 400);

const record = (token, body) => call(token, `/works/${work.id}/measurements`, { method: "POST", body: { boq_item_id: item.body.data.id, measured_on: new Date().toISOString().slice(0, 10), ...body } });
const entry = await record(aarav, { location: "Span 2", nos: 2, length: 10, breadth: 3 });
check("Contractor records L×B×nos → quantity and amount", entry.status === 201 && entry.body.data.quantity === 60 && entry.body.data.amount === 30000, `${entry.body.data?.quantity} sqm`);
check("Other contractor cannot record -> 403", (await record(kaveri, { quantity: 1 })).status === 403);
check("No dimensions or quantity -> 400", (await record(aarav, {})).status === 400);
check("Future date -> 400", (await record(aarav, { quantity: 1, measured_on: "2099-01-01" })).status === 400);
check("Exceeding the BoQ without remarks -> 400", (await record(aarav, { quantity: 50 })).status === 400);
const excess = await record(aarav, { quantity: 50, remarks: "Additional spalled area found after scabbling" });
check("…with a deviation note it is accepted and flagged", excess.status === 201 && excess.body.data.excess === true);
check("Rate is locked once measured -> 409", (await call(ee, `/boq-items/${item.body.data.id}`, { method: "PATCH", body: { rate: 600 } })).status === 409);
check("Measured item cannot be deleted -> 409", (await call(ee, `/boq-items/${item.body.data.id}`, { method: "DELETE" })).status === 409);

check("Contractor cannot check their own entry -> 403", (await call(aarav, `/measurements/${entry.body.data.id}/check`, { method: "POST", body: { decision: "check" } })).status === 403);
check("Rejecting needs a reason -> 400", (await call(ee, `/measurements/${excess.body.data.id}/check`, { method: "POST", body: { decision: "reject" } })).status === 400);
check("AE test-checks the contractor's entry", (await call(nisha, `/measurements/${entry.body.data.id}/check`, { method: "POST", body: { decision: "check" } })).body.data?.status === "CHECKED");
check("EE rejects the excess entry", (await call(ee, `/measurements/${excess.body.data.id}/check`, { method: "POST", body: { decision: "reject", remarks: "Area not verified on site" } })).body.data?.status === "REJECTED");
check("Checking twice -> 409", (await call(ee, `/measurements/${entry.body.data.id}/check`, { method: "POST", body: { decision: "check" } })).status === 409);

const bill = await call(ee, `/works/${work.id}/bills`, { method: "POST", body: { remarks: "Smoke RA bill" } });
check("EE prepares a bill from checked entries only", bill.status === 201 && bill.body.data.amount >= 30000);
check("Nothing left to bill -> 409", (await call(ee, `/works/${work.id}/bills`, { method: "POST", body: {} })).status === 409);
check("Preparer cannot approve their own bill -> 403", (await call(ee, `/bills/${bill.body.data.id}/approve`, { method: "POST", body: {} })).status === 403);
check("Return needs a reason -> 400", (await call(hq, `/bills/${bill.body.data.id}/return`, { method: "POST", body: {} })).status === 400);
check("HQ returns it; entries are released", (await call(hq, `/bills/${bill.body.data.id}/return`, { method: "POST", body: { remarks: "Attach the test-check register" } })).body.data?.status === "RETURNED");
const again = await call(ee, `/works/${work.id}/bills`, { method: "POST", body: {} });
check("Released entries can be billed again (next bill number)", again.status === 201 && again.body.data.bill_no === bill.body.data.bill_no + 1);
check("HQ approves", (await call(hq, `/bills/${again.body.data.id}/approve`, { method: "POST", body: {} })).body.data?.status === "APPROVED");
check("PFMS export of an approved bill", (await call(ee, `/integrations/pfms/bills/${again.body.data.id}`)).body.data?.payee?.name?.startsWith("Aarav"));
check("Payment needs a reference -> 400", (await call(ee, `/bills/${again.body.data.id}/pay`, { method: "POST", body: {} })).status === 400);
check("EE records payment", (await call(ee, `/bills/${again.body.data.id}/pay`, { method: "POST", body: { payment_ref: "PFMS/SMOKE/1" } })).body.data?.status === "PAID");

// Cumulative billing may never exceed the contract value.
const big = await call(ee, `/works/${work.id}/boq`, { method: "POST", body: { item_no: `${tag}B`, description: "Smoke oversized item", unit: "LS", quantity: 1, rate: 90000000 } });
const oversized = await call(ee, `/works/${work.id}/measurements`, { method: "POST", body: { boq_item_id: big.body.data.id, measured_on: new Date().toISOString().slice(0, 10), quantity: 1 } });
await call(hq, `/measurements/${oversized.body.data.id}/check`, { method: "POST", body: { decision: "check" } });
const capped = await call(ee, `/works/${work.id}/bills`, { method: "POST", body: {} });
check("Bill beyond the contract value -> 409", capped.status === 409, capped.body.error?.message?.slice(0, 60));

// Tidy: the oversized item would block every later bill on this work, so remove it directly.
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("delete from measurements where boq_item_id = $1", [big.body.data.id]);
await db.query("delete from boq_items where id = $1", [big.body.data.id]);
await db.end();

summary("M11");
