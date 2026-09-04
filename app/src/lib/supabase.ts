import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Public URL and anon key — safe to expose. Service role (server-only) is used for mutations.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _reader: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_reader) {
    _reader = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _reader;
}

let _writer: SupabaseClient | null = null;
export function dbWrite(): SupabaseClient {
  if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set — writes are disabled in this environment.");
  if (!_writer) {
    _writer = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _writer;
}

// Backward-compat alias
export const admin = db;
