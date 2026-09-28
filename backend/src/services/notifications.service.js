import { query } from "../config/db.js";
import AppError from "../utils/AppError.js";

function runner(db) {
  return db ? (text, params) => db.query(text, params) : query;
}

// One alert per recipient. A dedupe key already sent to the same person is skipped, so jobs can re-run safely.
export async function notify(db, { userIds, kind, severity = "INFO", title, body, link, dedupeKey }) {
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (!ids.length) return 0;
  const { rowCount } = await runner(db)(
    `insert into notifications (user_id, kind, severity, title, body, link, dedupe_key)
     select unnest($1::uuid[]), $2, $3, $4, $5, $6, $7
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`,
    [ids, kind, severity, title.slice(0, 200), body ?? null, link ?? null, dedupeKey ?? null]
  );
  return rowCount;
}

// Active users of the given roles whose office covers `orgUnitId` (the AE of that sub-division, its division's EE, HQ…).
export async function officersCovering(db, orgUnitId, roles) {
  if (!orgUnitId) return [];
  const { rows } = await runner(db)(
    `select u.id from users u join org_units o on o.id = u.org_unit_id, org_units t
      where t.id = $1 and u.is_active and u.role = any($2) and t.path like o.path || '%'`,
    [orgUnitId, roles]
  );
  return rows.map((row) => row.id);
}

export async function listNotifications(user, { unread }, { limit, offset }) {
  const filter = unread ? "and read_at is null" : "";
  const [{ rows }, counts] = await Promise.all([
    query(
      `select id, kind, severity, title, body, link, created_at, read_at from notifications
        where user_id = $1 ${filter} order by created_at desc limit $2 offset $3`,
      [user.id, limit, offset]
    ),
    query(
      `select count(*) filter (where true ${filter})::int as total, count(*) filter (where read_at is null)::int as unread
         from notifications where user_id = $1`,
      [user.id]
    )
  ]);
  return { rows, total: counts.rows[0].total, unread: counts.rows[0].unread };
}

export async function unreadNotifications(user) {
  const { rows } = await query("select count(*)::int as unread from notifications where user_id = $1 and read_at is null", [user.id]);
  return rows[0];
}

export async function markRead(user, id) {
  const { rows } = await query("update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning id, read_at", [id, user.id]);
  if (!rows[0]) throw AppError.notFound("Notification not found");
  return rows[0];
}

export async function markAllRead(user) {
  const { rowCount } = await query("update notifications set read_at = now() where user_id = $1 and read_at is null", [user.id]);
  return { marked: rowCount };
}
