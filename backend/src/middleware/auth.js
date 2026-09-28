import { query } from "../config/db.js";
import supabaseAdmin from "../config/supabase.js";
import AppError from "../utils/AppError.js";

// Verified token -> profile, kept until the token expires (max 5 min) to avoid a DB hit per request.
const cache = new Map();
const MAX_CACHE_MS = 5 * 60 * 1000;

// Called after an admin changes a user's role, office or active flag so it applies on their next request.
export function invalidateUserCache(userId) {
  for (const [token, entry] of cache) if (entry.user.id === userId) cache.delete(token);
}

export async function loadProfileByAuthId(authId) {
  const { rows } = await query(
    `select u.id, u.auth_id, u.name, u.email, u.role, u.designation, u.contractor_id, u.is_active,
            o.id as org_unit_id, o.name as org_unit_name, o.type as org_unit_type, o.path as org_path,
            c.name as contractor_name
       from users u
       join org_units o on o.id = u.org_unit_id
       left join contractors c on c.id = u.contractor_id
      where u.auth_id = $1`,
    [authId]
  );
  return rows[0] ?? null;
}

export default async function auth(request, _response, next) {
  try {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw AppError.unauthorized();

    const cached = cache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      request.user = cached.user;
      return next();
    }

    const { data, error } = await supabaseAdmin.auth.getClaims(token);
    if (error || !data?.claims?.sub) throw AppError.unauthorized("Invalid or expired session");

    const user = await loadProfileByAuthId(data.claims.sub);
    if (!user) throw AppError.forbidden("No GujInfra profile is linked to this login");
    if (!user.is_active) throw AppError.forbidden("This account is deactivated");

    const tokenExpiry = (data.claims.exp ?? 0) * 1000;
    cache.set(token, { user, expiresAt: Math.min(tokenExpiry, Date.now() + MAX_CACHE_MS) });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
