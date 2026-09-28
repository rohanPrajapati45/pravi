import pg from "pg";

const { Pool, types } = pg;

// Return NUMERIC as JS numbers (costs, chainage) instead of strings.
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
// Keep DATE as 'YYYY-MM-DD'; JS Date would shift it across the IST/UTC boundary.
types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on("error", (error) => {
  console.error("[db] idle client error", error.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
