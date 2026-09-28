import { query } from "../config/db.js";
import { ok } from "../utils/response.js";

export async function getHealth(_request, response) {
  const started = Date.now();
  try {
    const { rows } = await query("select now() as db_time, current_database() as db_name");
    return ok(response, {
      status: "ok",
      api: "ok",
      db: "ok",
      dbName: rows[0].db_name,
      dbTime: rows[0].db_time,
      dbLatencyMs: Date.now() - started
    });
  } catch (error) {
    return response.status(503).json({
      success: false,
      error: { code: "DB_UNAVAILABLE", message: error.message },
      data: { status: "degraded", api: "ok", db: "error" }
    });
  }
}
