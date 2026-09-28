import { query, withTransaction } from "../config/db.js";
import AppError from "../utils/AppError.js";
import { audit } from "./audit.service.js";
import { notify, officersCovering } from "./notifications.service.js";
import { canManage, getScopedWork } from "./works.service.js";

// Measurements are taken once a contract exists and until the work is handed over.
const MEASURABLE = ["AWARDED", "IN_PROGRESS", "COMPLETED"];
const OPEN_FOR_BOQ = ["PROPOSED", "TECHNICALLY_SANCTIONED", "ADMIN_APPROVED", "TENDERED", "AWARDED", "IN_PROGRESS", "COMPLETED"];
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const rupees = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function canRecord(user, work) {
  if (!MEASURABLE.includes(work.status) || !work.contractor_id) return false;
  if (user.role === "CONTRACTOR") return user.contractor_id === work.contractor_id;
  if (user.role === "AE") return user.org_path.startsWith(work.org_path);
  return canManage(user, work);
}

// The checker is never the recorder. An AE test-checks the contractor's entries; the EE/HQ can check anyone's.
function canCheck(user, work, entry) {
  if (entry.status !== "RECORDED" || entry.recorded_by === user.id) return false;
  if (user.role === "AE") return entry.recorded_by_role === "CONTRACTOR" && user.org_path.startsWith(work.org_path);
  return canManage(user, work);
}

function billActions(user, work, bill) {
  const actions = [];
  const approver = canManage(user, work) && bill.created_by !== user.id;
  if (bill.status === "SUBMITTED" && approver) actions.push("approve", "return");
  if (bill.status === "APPROVED" && canManage(user, work)) actions.push("pay");
  return actions;
}

export async function getMeasurementBook(user, workId) {
  const work = await getScopedWork(user, workId);
  const [items, entries, bills] = await Promise.all([
    query(
      `select b.*,
              coalesce(sum(m.quantity) filter (where m.status <> 'REJECTED'), 0) as measured_qty,
              coalesce(sum(m.quantity) filter (where m.status = 'CHECKED'), 0) as checked_qty,
              coalesce(sum(m.quantity) filter (where m.bill_id is not null), 0) as billed_qty,
              count(m.id)::int as entries
         from boq_items b left join measurements m on m.boq_item_id = b.id
        where b.work_id = $1 group by b.id order by b.item_no`,
      [workId]
    ),
    query(
      `select m.*, b.item_no, b.description as item_description, b.unit, b.rate,
              r.name as recorded_by_name, r.role as recorded_by_role, c.name as checked_by_name, rb.bill_no
         from measurements m join boq_items b on b.id = m.boq_item_id
         join users r on r.id = m.recorded_by left join users c on c.id = m.checked_by
         left join running_bills rb on rb.id = m.bill_id
        where m.work_id = $1 order by m.entry_no desc`,
      [workId]
    ),
    query(
      `select rb.*, cu.name as created_by_name, du.name as decided_by_name
         from running_bills rb join users cu on cu.id = rb.created_by left join users du on du.id = rb.decided_by
        where rb.work_id = $1 order by rb.bill_no desc`,
      [workId]
    )
  ]);

  const itemRows = items.rows.map((item) => ({
    ...item,
    amount: round(item.quantity * item.rate, 2),
    measured_amount: round(item.measured_qty * item.rate, 2),
    measured_pct: round((100 * item.measured_qty) / item.quantity, 1),
    excess: item.measured_qty > item.quantity
  }));
  const entryRows = entries.rows.map((entry) => ({ ...entry, actions: canCheck(user, work, entry) ? ["check", "reject"] : [] }));
  const live = bills.rows.filter((bill) => bill.status !== "RETURNED");
  const unbilled = entryRows.filter((entry) => entry.status === "CHECKED" && !entry.bill_id);
  return {
    work: {
      id: work.id,
      work_code: work.work_code,
      title: work.title,
      status: work.status,
      contract_value: work.contract_value,
      contractor_name: work.contractor_name,
      org_unit_name: work.org_unit_name
    },
    items: itemRows,
    entries: entryRows,
    bills: bills.rows.map((bill) => ({ ...bill, actions: billActions(user, work, bill) })),
    totals: {
      boq_amount: round(itemRows.reduce((sum, item) => sum + item.amount, 0), 2),
      measured_amount: round(entryRows.filter((entry) => entry.status !== "REJECTED").reduce((sum, entry) => sum + entry.amount, 0), 2),
      checked_amount: round(entryRows.filter((entry) => entry.status === "CHECKED").reduce((sum, entry) => sum + entry.amount, 0), 2),
      billed_amount: round(live.reduce((sum, bill) => sum + bill.amount, 0), 2),
      paid_amount: round(live.filter((bill) => bill.status === "PAID").reduce((sum, bill) => sum + bill.amount, 0), 2),
      unbilled_amount: round(unbilled.reduce((sum, entry) => sum + entry.amount, 0), 2),
      unbilled_entries: unbilled.length,
      pending_check: entryRows.filter((entry) => entry.status === "RECORDED").length
    },
    permissions: {
      edit_boq: canManage(user, work) && OPEN_FOR_BOQ.includes(work.status),
      record: canRecord(user, work),
      bill: canManage(user, work) && MEASURABLE.includes(work.status) && unbilled.length > 0,
      reason: !work.contractor_id ? "Measurements start once the work is awarded to a contractor" : !MEASURABLE.includes(work.status) ? `Work is ${work.status.toLowerCase().replaceAll("_", " ")}` : null
    }
  };
}

// ---------- bill of quantities ----------

export async function addBoqItem(user, workId, input, ip) {
  const work = await getScopedWork(user, workId);
  if (!canManage(user, work)) throw AppError.forbidden("Only the responsible EE or HQ maintains the BoQ");
  if (!OPEN_FOR_BOQ.includes(work.status)) throw AppError.invalidTransition(`The BoQ is frozen — work is ${work.status.toLowerCase()}`);
  try {
    const { rows } = await query(
      `insert into boq_items (work_id, item_no, description, unit, quantity, rate, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [workId, input.item_no, input.description, input.unit, input.quantity, input.rate, user.id]
    );
    await audit({ user, action: "BOQ_ITEM_ADDED", entity: "boq_item", entityId: rows[0].id, diff: { work_id: workId, after: input }, ip });
    return rows[0];
  } catch (error) {
    if (error.code === "23505") throw AppError.badRequest(`Item ${input.item_no} already exists in this BoQ`);
    throw error;
  }
}

async function scopedItem(user, itemId) {
  const { rows } = await query("select * from boq_items where id = $1", [itemId]);
  if (!rows[0]) throw AppError.notFound("BoQ item not found");
  const work = await getScopedWork(user, rows[0].work_id);
  if (!canManage(user, work)) throw AppError.forbidden("Only the responsible EE or HQ maintains the BoQ");
  if (!OPEN_FOR_BOQ.includes(work.status)) throw AppError.invalidTransition(`The BoQ is frozen — work is ${work.status.toLowerCase()}`);
  const { rows: used } = await query("select count(*)::int as n from measurements where boq_item_id = $1 and status <> 'REJECTED'", [itemId]);
  return { item: rows[0], work, measured: used[0].n };
}

export async function updateBoqItem(user, itemId, input, ip) {
  const { item, measured } = await scopedItem(user, itemId);
  // Once quantities are measured against a rate, changing it would silently re-price work already done.
  if (measured && input.rate !== undefined && Number(input.rate) !== Number(item.rate)) {
    throw AppError.invalidTransition("The rate is locked once measurements exist — record a variation item instead");
  }
  const keys = Object.keys(input);
  if (!keys.length) return item;
  const { rows } = await query(
    `update boq_items set ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} where id = $1 returning *`,
    [itemId, ...Object.values(input)]
  );
  await audit({ user, action: "BOQ_ITEM_UPDATED", entity: "boq_item", entityId: itemId, diff: { work_id: item.work_id, before: Object.fromEntries(keys.map((key) => [key, item[key]])), after: input }, ip });
  return rows[0];
}

export async function deleteBoqItem(user, itemId, ip) {
  const { item } = await scopedItem(user, itemId);
  const { rows } = await query("select count(*)::int as n from measurements where boq_item_id = $1", [itemId]);
  if (rows[0].n) throw AppError.invalidTransition("Items with measurements cannot be deleted");
  await query("delete from boq_items where id = $1", [itemId]);
  await audit({ user, action: "BOQ_ITEM_DELETED", entity: "boq_item", entityId: itemId, diff: { work_id: item.work_id, before: item }, ip });
  return { id: itemId, deleted: true };
}

// ---------- measurement book ----------

export async function recordMeasurement(user, workId, input, ip) {
  const work = await getScopedWork(user, workId);
  if (!canRecord(user, work)) {
    throw AppError.forbidden(
      !work.contractor_id || !MEASURABLE.includes(work.status)
        ? "Measurements are recorded between award and handover"
        : "Only the contractor holding this work, the division's AEs, the EE or HQ record measurements"
    );
  }
  const dims = [input.length, input.breadth, input.depth].filter((value) => value != null);
  const quantity = round(dims.length ? input.nos * dims.reduce((product, value) => product * value, 1) : input.quantity ?? 0, 3);
  if (!(quantity > 0)) throw AppError.badRequest("Enter dimensions (length / breadth / depth) or a quantity");
  if (input.measured_on > new Date().toISOString().slice(0, 10)) throw AppError.badRequest("Measurement date cannot be in the future");

  const recorded = await withTransaction(async (client) => {
    await client.query("select id from works where id = $1 for update", [workId]);
    const { rows: items } = await client.query("select * from boq_items where id = $1 and work_id = $2", [input.boq_item_id, workId]);
    const item = items[0];
    if (!item) throw AppError.badRequest("BoQ item not found on this work");
    const { rows: sums } = await client.query(
      "select coalesce(sum(quantity), 0) as done from measurements where boq_item_id = $1 and status <> 'REJECTED'",
      [item.id]
    );
    const cumulative = Number(sums[0].done) + quantity;
    const excess = cumulative > Number(item.quantity);
    if (excess && !input.remarks?.trim()) {
      throw AppError.badRequest(
        `This takes item ${item.item_no} to ${round(cumulative, 3)} ${item.unit} against a BoQ quantity of ${Number(item.quantity)} — explain the deviation in remarks`
      );
    }
    const { rows } = await client.query(
      `insert into measurements (work_id, boq_item_id, entry_no, measured_on, location, nos, length, breadth, depth, quantity, amount, remarks, excess, recorded_by)
       values ($1, $2, (select coalesce(max(entry_no), 0) + 1 from measurements where work_id = $1), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning *`,
      [workId, item.id, input.measured_on, input.location ?? null, input.nos, input.length ?? null, input.breadth ?? null, input.depth ?? null, quantity, round(quantity * item.rate, 2), input.remarks ?? null, excess, user.id]
    );
    const [ee] = await officersCovering(client, work.org_unit_id, ["EE"]);
    await audit(
      {
        user,
        action: "MEASUREMENT_RECORDED",
        entity: "measurement",
        entityId: rows[0].id,
        diff: { work_id: workId, remarks: `MB entry ${rows[0].entry_no}: item ${item.item_no} · ${quantity} ${item.unit} · ${rupees(rows[0].amount)}${excess ? " · exceeds BoQ" : ""}` },
        ip,
        targetUserId: ee && ee !== user.id ? ee : null
      },
      client
    );
    return rows[0];
  });
  return recorded;
}

export async function checkMeasurement(user, entryId, { decision, remarks }, ip) {
  const { rows } = await query(
    `select m.*, r.role as recorded_by_role, b.item_no, b.unit from measurements m join users r on r.id = m.recorded_by join boq_items b on b.id = m.boq_item_id where m.id = $1`,
    [entryId]
  );
  const entry = rows[0];
  if (!entry) throw AppError.notFound("Measurement not found");
  const work = await getScopedWork(user, entry.work_id);
  if (entry.status !== "RECORDED") throw AppError.invalidTransition(`Entry ${entry.entry_no} is already ${entry.status.toLowerCase()}`);
  if (entry.recorded_by === user.id) throw AppError.forbidden("You cannot check your own measurement");
  if (!canCheck(user, work, entry)) throw AppError.forbidden(user.role === "AE" ? "An AE test-checks the contractor's entries; the EE checks the rest" : "Only the responsible EE or HQ checks measurements");
  if (decision === "reject" && !remarks?.trim()) throw AppError.badRequest("Say why the measurement is rejected");

  const status = decision === "check" ? "CHECKED" : "REJECTED";
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      "update measurements set status = $2, checked_by = $3, checked_at = now(), check_remarks = $4 where id = $1 and status = 'RECORDED'",
      [entryId, status, user.id, remarks ?? null]
    );
    if (!rowCount) throw AppError.invalidTransition("This entry was just checked by someone else");
    await audit(
      {
        user,
        action: decision === "check" ? "MEASUREMENT_CHECKED" : "MEASUREMENT_REJECTED",
        entity: "measurement",
        entityId: entryId,
        diff: { work_id: entry.work_id, remarks: `MB entry ${entry.entry_no} (item ${entry.item_no}, ${entry.quantity} ${entry.unit})${remarks ? ` · ${remarks}` : ""}` },
        ip,
        targetUserId: entry.recorded_by
      },
      client
    );
    return { id: entryId, entry_no: entry.entry_no, status };
  });
}

// ---------- running (RA) bills ----------

export async function createBill(user, workId, { remarks }, ip) {
  const work = await getScopedWork(user, workId);
  if (!canManage(user, work)) throw AppError.forbidden("Only the responsible EE or HQ prepares running bills");
  if (!MEASURABLE.includes(work.status)) throw AppError.invalidTransition(`Work is ${work.status.toLowerCase()}`);
  return withTransaction(async (client) => {
    await client.query("select id from works where id = $1 for update", [workId]);
    const { rows: entries } = await client.query(
      "select id, amount from measurements where work_id = $1 and status = 'CHECKED' and bill_id is null for update",
      [workId]
    );
    if (!entries.length) throw AppError.invalidTransition("No checked, unbilled measurements to bill");
    const amount = round(entries.reduce((sum, entry) => sum + Number(entry.amount), 0), 2);
    const { rows: previous } = await client.query(
      "select coalesce(sum(amount), 0) as billed, coalesce(max(bill_no), 0) as last from running_bills where work_id = $1",
      [workId]
    );
    const { rows: live } = await client.query("select coalesce(sum(amount), 0) as billed from running_bills where work_id = $1 and status <> 'RETURNED'", [workId]);
    const cumulative = round(Number(live[0].billed) + amount, 2);
    if (work.contract_value && cumulative > Number(work.contract_value)) {
      throw AppError.invalidTransition(`Cumulative billing ${rupees(cumulative)} would exceed the contract value ${rupees(work.contract_value)} — a variation must be sanctioned first`);
    }
    const { rows } = await client.query(
      `insert into running_bills (work_id, bill_no, amount, cumulative_amount, entries, created_by, remarks) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [workId, Number(previous[0].last) + 1, amount, cumulative, entries.length, user.id, remarks ?? null]
    );
    const bill = rows[0];
    await client.query("update measurements set bill_id = $2 where id = any($1)", [entries.map((entry) => entry.id), bill.id]);
    await audit(
      { user, action: "BILL_SUBMITTED", entity: "running_bill", entityId: bill.id, diff: { work_id: workId, remarks: `RA bill ${bill.bill_no}: ${rupees(amount)} for ${entries.length} entries (cumulative ${rupees(cumulative)})` }, ip },
      client
    );
    // The approver is anyone who manages the work other than the preparer: HQ, or the EE when HQ prepared it.
    const approvers = (await officersCovering(client, work.org_unit_id, user.role === "HQ" ? ["EE", "HQ"] : ["HQ"])).filter((id) => id !== user.id);
    await notify(client, {
      userIds: approvers,
      kind: "BILL",
      title: `RA bill ${bill.bill_no} on ${work.work_code} awaits approval`,
      body: `${rupees(amount)} · ${entries.length} checked entries`,
      link: `/works/${workId}/mb`,
      dedupeKey: `bill:${bill.id}:submitted`
    });
    return bill;
  });
}

async function billStep(user, billId, { from, to, action, remarks, paymentRef }, ip) {
  const { rows } = await query("select * from running_bills where id = $1", [billId]);
  const bill = rows[0];
  if (!bill) throw AppError.notFound("Bill not found");
  const work = await getScopedWork(user, bill.work_id);
  if (!billActions(user, work, bill).includes(action)) {
    if (bill.status !== from) throw AppError.invalidTransition(`RA bill ${bill.bill_no} is ${bill.status.toLowerCase()}`);
    throw AppError.forbidden(bill.created_by === user.id && action !== "pay" ? "The person who prepared a bill cannot approve or return it" : "Only the responsible EE or HQ acts on bills");
  }
  return withTransaction(async (client) => {
    const sets =
      action === "pay"
        ? ["status = $2", "payment_ref = $3", "paid_at = now()"]
        : ["status = $2", "decided_by = $3", "decided_at = now()", "remarks = coalesce($4, remarks)"];
    const params = action === "pay" ? [billId, to, paymentRef] : [billId, to, user.id, remarks ?? null];
    const { rowCount } = await client.query(`update running_bills set ${sets.join(", ")} where id = $1 and status = '${from}'`, params);
    if (!rowCount) throw AppError.invalidTransition("This bill was just updated by someone else");
    // A returned bill releases its entries so they can be corrected and billed again.
    if (action === "return") await client.query("update measurements set bill_id = null where bill_id = $1", [billId]);
    await audit(
      {
        user,
        action: { approve: "BILL_APPROVED", return: "BILL_RETURNED", pay: "BILL_PAID" }[action],
        entity: "running_bill",
        entityId: billId,
        diff: { work_id: bill.work_id, remarks: `RA bill ${bill.bill_no} · ${rupees(bill.amount)}${paymentRef ? ` · payment ${paymentRef}` : ""}${remarks ? ` · ${remarks}` : ""}` },
        ip,
        targetUserId: bill.created_by !== user.id ? bill.created_by : null
      },
      client
    );
    if (action === "pay" && work.contractor_id) {
      const { rows: firm } = await client.query("select id from users where contractor_id = $1 and is_active", [work.contractor_id]);
      await notify(client, {
        userIds: firm.map((row) => row.id),
        kind: "BILL",
        title: `RA bill ${bill.bill_no} paid on ${work.work_code}`,
        body: `${rupees(bill.amount)} · payment reference ${paymentRef}`,
        link: `/works/${bill.work_id}/mb`,
        dedupeKey: `bill:${billId}:paid`
      });
    }
    return { id: billId, bill_no: bill.bill_no, status: to };
  });
}

export const approveBill = (user, id, body, ip) => billStep(user, id, { from: "SUBMITTED", to: "APPROVED", action: "approve", remarks: body.remarks }, ip);
export const returnBill = (user, id, body, ip) => billStep(user, id, { from: "SUBMITTED", to: "RETURNED", action: "return", remarks: body.remarks }, ip);
export const payBill = (user, id, body, ip) => billStep(user, id, { from: "APPROVED", to: "PAID", action: "pay", paymentRef: body.payment_ref }, ip);

export async function getBill(user, billId) {
  const { rows } = await query("select * from running_bills where id = $1", [billId]);
  if (!rows[0]) throw AppError.notFound("Bill not found");
  const work = await getScopedWork(user, rows[0].work_id);
  const { rows: entries } = await query(
    `select m.entry_no, m.measured_on, m.location, m.quantity, m.amount, b.item_no, b.description, b.unit, b.rate
       from measurements m join boq_items b on b.id = m.boq_item_id where m.bill_id = $1 order by m.entry_no`,
    [billId]
  );
  return { bill: rows[0], work, entries };
}
