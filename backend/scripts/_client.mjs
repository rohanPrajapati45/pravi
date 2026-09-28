// Shared helpers for the smoke-test scripts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });

const API = `http://localhost:${process.env.PORT || 4000}/api/v1`;
const PASSWORD = process.env.DEMO_PASSWORD || "GujInfra@2026";
let failures = 0;

export function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}

export function summary(label) {
  console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll ${label} checks passed`);
  process.exitCode = failures ? 1 : 0;
}

export async function login(email) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

export async function call(token, route, options = {}) {
  const started = Date.now();
  const response = await fetch(`${API}${route}`, {
    method: options.method ?? "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { status: response.status, body: await response.json(), ms: Date.now() - started };
}
