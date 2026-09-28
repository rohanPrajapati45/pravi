import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

const required = ["DATABASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`[env] Missing ${missing.join(", ")} in Pravi/.env — DB calls will fail until it is set.`);
}
