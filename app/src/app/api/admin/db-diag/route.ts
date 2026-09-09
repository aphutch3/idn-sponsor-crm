// Diagnostic route: runs a battery of queries against the configured DB backend
// (Supabase or Neon depending on DB_TARGET) and returns their raw {data, error, count}
// results. Useful for verifying schema parity during the Neon cutover.
//
// GET /api/admin/db-diag?secret=<CRON_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { db, activeDbTarget } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Probe = {
  name: string;
  // Supabase builders are PromiseLike, not Promise — use PromiseLike here.
  run: (d: ReturnType<typeof db>) => PromiseLike<unknown>;
};

const probes: Probe[] = [
  { name: "tag.count",         run: (d) => d.from("tag").select("id", { count: "exact", head: true }) },
  { name: "tags.count",        run: (d) => d.from("tags").select("id", { count: "exact", head: true }) },
  { name: "company.count",     run: (d) => d.from("company").select("id", { count: "exact", head: true }) },
  { name: "companies.count",   run: (d) => d.from("companies").select("id", { count: "exact", head: true }) },
  { name: "contact.count",     run: (d) => d.from("contact").select("id", { count: "exact", head: true }) },
  { name: "contacts.count",    run: (d) => d.from("contacts").select("id", { count: "exact", head: true }) },
  { name: "social_mention.count",  run: (d) => d.from("social_mention").select("id", { count: "exact", head: true }) },
  { name: "social_mentions.count", run: (d) => d.from("social_mentions").select("id", { count: "exact", head: true }) },
  { name: "linkedin_post.count",  run: (d) => d.from("linkedin_post").select("id", { count: "exact", head: true }) },
  { name: "linkedin_posts.count", run: (d) => d.from("linkedin_posts").select("id", { count: "exact", head: true }) },
  { name: "list.select 3",       run: (d) => d.from("list").select("id, name, kind").limit(3) },
  { name: "lists.select 3",      run: (d) => d.from("lists").select("id, name").limit(3) },
  { name: "tag.select 3",        run: (d) => d.from("tag").select("slug, label").limit(3) },
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const d = db();
  const results: Record<string, { ok: boolean; count?: number | null; error?: unknown; sample?: unknown }> = {};

  for (const p of probes) {
    try {
      const r = (await p.run(d)) as { data: unknown; error: unknown; count?: number | null };
      results[p.name] = {
        ok: !r.error,
        count: r.count ?? null,
        error: r.error ?? undefined,
        sample: r.data && Array.isArray(r.data) ? (r.data as unknown[]).slice(0, 2) : undefined,
      };
    } catch (err) {
      results[p.name] = { ok: false, error: { message: (err as Error).message } };
    }
  }

  return NextResponse.json({
    db_target: activeDbTarget(),
    node_env: process.env.NODE_ENV,
    results,
  });
}
