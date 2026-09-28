import { createClient } from "@supabase/supabase-js";

// Publishable key only; the secret key never leaves the backend.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  { auth: { persistSession: true, autoRefreshToken: true } }
);
