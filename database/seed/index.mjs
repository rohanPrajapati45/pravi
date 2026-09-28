import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

const { orgUsersStep } = await import("./01_org_users.mjs");
const { assetsStep } = await import("./02_assets.mjs");
const { inspectionsStep } = await import("./03_inspections.mjs");
const { maintenanceStep } = await import("./04_maintenance.mjs");
const { templatesStep } = await import("./05_works.mjs");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in Pravi/.env");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

// Each step is idempotent and runs in order; later modules append steps here.
// `context` carries ids (orgIds, userIds, ...) from earlier steps to later ones.
const steps = [orgUsersStep, assetsStep, inspectionsStep, maintenanceStep, templatesStep];
const context = {};

async function run() {
  await client.connect();
  for (const step of steps) {
    process.stdout.write(`Seeding ${step.name} ... `);
    await client.query("BEGIN");
    try {
      await step.run(client, context);
      await client.query("COMMIT");
      console.log("done");
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw error;
    }
  }
  console.log(steps.length ? "Seed complete." : "No seed steps yet.");
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
