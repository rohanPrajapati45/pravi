import { createClient } from "@supabase/supabase-js";

// Server-only client: uses the secret key, never exposed to the frontend.
export const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export default supabaseAdmin;
