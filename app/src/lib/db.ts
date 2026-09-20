// Canonical Postgres data access — postgres.js against the IDN canonical database.
//
// Single source of truth. No shim, no Supabase client. Just tagged-template SQL.
//
// Environment:
//   DATABASE_URL_CANONICAL      — full DSN with role + password
//   DATABASE_URL_CANONICAL_READ — optional read replica DSN; falls back to DATABASE_URL_CANONICAL
//
// Usage:
//   import { sql } from '@/lib/db';
//   const rows = await sql`select id, name from company where id = ${id}`;
//   await sql`update company set name = ${name} where id = ${id}`;
//
// JSONB values are auto-serialized by postgres.js — don't ::jsonb-cast on the app side.
// For arrays, pass a JS array; postgres.js encodes to array literals correctly.

import postgres, { Sql, TransactionSql } from "postgres";

declare global {
  // Pool per Node.js process. Next.js can hot-reload modules; keep instances on globalThis
  // in dev so we don't leak connections.
  // eslint-disable-next-line no-var
  var __idn_sql: Sql | undefined;
  // eslint-disable-next-line no-var
  var __idn_sql_read: Sql | undefined;
}

function makePool(dsn: string, opts: Partial<postgres.Options<Record<string, postgres.PostgresType>>> = {}): Sql {
  return postgres(dsn, {
    prepare: false, // Neon pooler doesn't support named prepared statements over pgbouncer
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: {
      // Convert PostgreSQL row column names in incoming data (undefined | 'camel' | 'snake')
      undefined: null, // send JS `undefined` as SQL NULL rather than throwing
    },
    ...opts,
  });
}

function writePool(): Sql {
  const dsn = process.env.DATABASE_URL_CANONICAL;
  if (!dsn) throw new Error("DATABASE_URL_CANONICAL is not set");
  if (!globalThis.__idn_sql) globalThis.__idn_sql = makePool(dsn);
  return globalThis.__idn_sql;
}

function readPool(): Sql {
  const dsn = process.env.DATABASE_URL_CANONICAL_READ ?? process.env.DATABASE_URL_CANONICAL;
  if (!dsn) throw new Error("DATABASE_URL_CANONICAL is not set");
  if (!globalThis.__idn_sql_read) globalThis.__idn_sql_read = makePool(dsn);
  return globalThis.__idn_sql_read;
}

// Proxy target must be callable for `sql\`...\`` template tag invocation to hit the apply trap.
// Using {} (non-callable) makes `sql` throw "is not a function" when invoked as a tag.
const sqlTarget = function () {} as unknown as Sql;
const sqlReadTarget = function () {} as unknown as Sql;

/**
 * Default SQL handle — reads and writes. Use this everywhere unless you need to force
 * the read replica.
 */
export const sql = new Proxy(sqlTarget, {
  get(_target, prop, receiver) {
    return Reflect.get(writePool(), prop, receiver);
  },
  apply(_target, thisArg, argArray) {
    return Reflect.apply(writePool() as unknown as (...args: unknown[]) => unknown, thisArg, argArray);
  },
});

/**
 * Read-replica handle. Use for heavy analytics queries that don't need write consistency.
 * Falls back to the primary if no replica DSN is configured.
 */
export const sqlRead = new Proxy(sqlReadTarget, {
  get(_target, prop, receiver) {
    return Reflect.get(readPool(), prop, receiver);
  },
  apply(_target, thisArg, argArray) {
    return Reflect.apply(readPool() as unknown as (...args: unknown[]) => unknown, thisArg, argArray);
  },
});

/**
 * Convenience: run a fn inside a transaction. postgres.js handles BEGIN/COMMIT/ROLLBACK.
 */
export async function tx<T>(fn: (t: TransactionSql) => Promise<T>): Promise<T> {
  return writePool().begin(fn) as Promise<T>;
}

/**
 * Convenience: convert nullable rows to a maybe-single. Throws if 2+ rows.
 */
export function maybeSingle<T>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error(`maybeSingle: expected 0 or 1 row, got ${rows.length}`);
  return rows[0];
}

/**
 * Convenience: convert to a required single row. Throws if 0 or 2+ rows.
 */
export function single<T>(rows: readonly T[]): T {
  if (rows.length !== 1) throw new Error(`single: expected exactly 1 row, got ${rows.length}`);
  return rows[0];
}

/**
 * Consistent error shape for API routes.
 */
export function dbError(e: unknown): { message: string; code?: string; detail?: string } {
  const err = e as { message?: string; code?: string; detail?: string };
  return {
    message: err?.message ?? String(e),
    code: err?.code,
    detail: err?.detail,
  };
}
