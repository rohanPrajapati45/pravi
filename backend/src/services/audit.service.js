import { query as poolQuery } from "../config/db.js";

// `db` may be a transaction client so the trail commits or rolls back with the change it describes.
function runner(db) {
  return db ? (text, params) => db.query(text, params) : poolQuery;
}

// `targetUserId` = the person the action is directed at (assignee, submitter…), used for activity feeds.
export async function audit({ user, action, entity, entityId, diff, ip, targetUserId }, db) {
  await runner(db)(
    `insert into audit_logs (user_id, actor_role, action, entity, entity_id, diff, ip, target_user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [user?.id ?? null, user?.role ?? "SYSTEM", action, entity, entityId ? String(entityId) : null, diff ?? null, ip ?? null, targetUserId ?? null]
  );
}

export async function lifecycleEvent(
  { assetId, eventType, fromStatus, toStatus, user, lat, lng, refType, refId, before, after, remarks, at },
  db
) {
  await runner(db)(
    `insert into lifecycle_events
       (asset_id, event_type, from_status, to_status, actor_id, actor_role, lat, lng, ref_type, ref_id, before, after, remarks, at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, coalesce($14, now()))`,
    [
      assetId,
      eventType,
      fromStatus ?? null,
      toStatus ?? null,
      user?.id ?? null,
      user?.role ?? "SYSTEM",
      lat ?? null,
      lng ?? null,
      refType ?? null,
      refId ?? null,
      before ?? null,
      after ?? null,
      remarks ?? null,
      at ?? null
    ]
  );
}
