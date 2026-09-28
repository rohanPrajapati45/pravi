import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

const migrationsDir = path.join(here, "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in Pravi/.env");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query("select id from schema_migrations");
  const applied = new Set(rows.map((row) => row.id));
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`Applying ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [file]);
      await client.query("COMMIT");
      console.log("done");
      count += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw error;
    }
  }

  console.log(count ? `${count} migration(s) applied.` : "Database is up to date.");
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
