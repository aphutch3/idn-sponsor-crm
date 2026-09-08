import { NextRequest, NextResponse } from "next/server";
import { dbWrite } from "@/lib/supabase";

/**
 * One-shot seed endpoint for the IDN topic taxonomy.
 * POST { tags: [{ slug, name, category, description, articles_30d, keyword_phrases }] }
 *
 * Guarded by CRON_SECRET so it can't be triggered casually.
 * Idempotent via ON CONFLICT (slug) DO UPDATE.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.CRON_SECRET ?? "";

type SeedTag = {
  slug: string;
  name: string;
  category?: string | null;
  description?: string | null;
  articles_30d?: number;
  keyword_phrases?: string[];
};

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { tags?: SeedTag[] };
  const tags = body.tags ?? [];
  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ error: "no tags in body" }, { status: 400 });
  }

  const rows = tags.map((t) => ({
    slug: t.slug,
    name: t.name,
    category: t.category ?? null,
    description: t.description ?? null,
    aliases: [],
    keyword_phrases: t.keyword_phrases ?? [],
    articles_30d: t.articles_30d ?? 0,
    active: true,
  }));

  const supa = dbWrite();
  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supa
      .from("linkedin_topic_tags")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "slug" });
    if (error) {
      return NextResponse.json({ error: error.message, upserted }, { status: 500 });
    }
    upserted += Math.min(BATCH, rows.length - i);
  }

  const { count } = await supa
    .from("linkedin_topic_tags")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({ ok: true, upserted, total_in_table: count });
}
