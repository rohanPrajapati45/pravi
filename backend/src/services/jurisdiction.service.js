import { query } from "../config/db.js";
import AppError from "../utils/AppError.js";

// Returns a SQL condition restricting `orgAlias` (an org_units alias) to the user's subtree,
// pushing its parameter into `params`. HQ sees everything.
export function applyJurisdictionScope(user, params, orgAlias = "o") {
  if (user.role === "HQ") return "true";
  params.push(`${user.org_path}%`);
  return `${orgAlias}.path like $${params.length}`;
}

export function isPathInScope(user, path) {
  return user.role === "HQ" || path.startsWith(user.org_path);
}

export async function assertOrgUnitInScope(user, orgUnitId) {
  const { rows } = await query("select path from org_units where id = $1", [orgUnitId]);
  if (!rows[0]) throw AppError.notFound("Org unit not found");
  if (!isPathInScope(user, rows[0].path)) {
    throw AppError.forbidden("This record is outside your jurisdiction");
  }
  return rows[0].path;
}
