import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createNeonClient } from "@/lib/neon-db";

// DB_TARGET selects the backend for db() / dbWrite():
//   supabase (default) — legacy Supabase Postgres via @supabase/supabase-js
//   neon               — canonical Neon Postgres via @neondatabase/serverless + our shim
//
// The Neon path returns a NeonSupabaseLikeClient that exposes the same .from() / .rpc() / builder chain
// the app already uses. Callers should NOT branch on DB_TARGET — the returned client answers to the same
// interface either way.

const target = (process.env.DB_TARGET ?? "supabase").toLowerCase();
if (target !== "supabase" && target !== "neon") {
  throw new Error(`DB_TARGET must be "supabase" or "neon"; got "${target}"`);
}

// ---- supabase clients ------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---- neon DSNs -------------------------------------------------------------------
// DATABASE_URL_CANONICAL       — read + write DSN for canonical (single owner role)
// DATABASE_URL_CANONICAL_READ  — optional read-only DSN; falls back to DATABASE_URL_CANONICAL
const neonWriteDsn = process.env.DATABASE_URL_CANONICAL;
const neonReadDsn = process.env.DATABASE_URL_CANONICAL_READ ?? neonWriteDsn;

// ---- typing ---------------------------------------------------------------------
// Callers in the app already type against SupabaseClient. The Neon shim implements the subset of
// PostgREST-style methods actually used in this codebase (see neon-db.ts header). We cast at the
// factory boundary so downstream code keeps its existing SupabaseClient-typed chains without change.
// If callers ever reach for auth/storage/realtime on the Neon path, the property access will return
// undefined at runtime — but this codebase does not use those APIs against db()/dbWrite().

// -------- reader ------------------------------------------------------------------
let _reader: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (_reader) return _reader;
  if (target === "neon") {
    if (!neonReadDsn) {
      throw new Error("DB_TARGET=neon but DATABASE_URL_CANONICAL is not set");
    }
    _reader = createNeonClient(neonReadDsn) as unknown as SupabaseClient;
  } else {
    _reader = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _reader;
}

// -------- writer ------------------------------------------------------------------
let _writer: SupabaseClient | null = null;
export function dbWrite(): SupabaseClient {
  if (_writer) return _writer;
  if (target === "neon") {
    if (!neonWriteDsn) {
      throw new Error("DB_TARGET=neon but DATABASE_URL_CANONICAL is not set");
    }
    _writer = createNeonClient(neonWriteDsn) as unknown as SupabaseClient;
  } else {
    if (!supabaseService) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY not set — writes are disabled in this environment.",
      );
    }
    _writer = createClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _writer;
}

// Backward-compat alias
export const admin = db;

// Diagnostic helper: which backend is active? Useful for /api/admin/pplx-diag-style routes.
export function activeDbTarget(): "supabase" | "neon" {
  return target as "supabase" | "neon";
}
