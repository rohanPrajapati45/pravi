import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Names of missing public settings; the login screen shows these instead of the app crashing.
export const missingConfig = [
  !/^https?:\/\//.test(url) && "NEXT_PUBLIC_SUPABASE_URL",
  !key && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  !process.env.NEXT_PUBLIC_API_URL && "NEXT_PUBLIC_API_URL"
].filter(Boolean) as string[];

// Publishable key only; the secret key never leaves the backend.
// A placeholder URL keeps the module loadable when configuration is missing.
export const supabase = createClient(/^https?:\/\//.test(url) ? url : "http://config-missing.invalid", key || "missing", {
  auth: { persistSession: true, autoRefreshToken: true }
});
