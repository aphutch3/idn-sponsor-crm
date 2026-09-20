// One-shot seed endpoint for the IDN topic taxonomy.
// POST { tags: [{ slug, name, category, description, articles_30d, keyword_phrases }] }
//
// Guarded by CRON_SECRET so it can't be triggered casually.
// Idempotent via ON CONFLICT (slug) DO UPDATE.
// Canonical singular: public.linkedin_topic_tag.

import { NextRequest, NextResponse } from "next/server";
import { sql, dbError } from "@/lib/db";

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

const BATCH = 200;

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

  let upserted = 0;
  try {
    for (let i = 0; i < tags.length; i += BATCH) {
      const chunk = tags.slice(i, i + BATCH);
      for (const t of chunk) {
        await sql`
          insert into public.linkedin_topic_tag
            (slug, name, category, description, aliases, keyword_phrases, articles_30d, active)
          values
            (${t.slug},
             ${t.name},
             ${t.category ?? null},
             ${t.description ?? null},
             ${sql.array([] as string[])}::text[],
             ${sql.array((t.keyword_phrases ?? []) as string[])}::text[],
             ${t.articles_30d ?? 0},
             ${true})
          on conflict (slug) do update set
            name            = excluded.name,
            category        = excluded.category,
            description     = excluded.description,
            keyword_phrases = excluded.keyword_phrases,
            articles_30d    = excluded.articles_30d,
            active          = excluded.active,
            updated_at      = now()
        `;
      }
      upserted += chunk.length;
    }
  } catch (e) {
    const err = dbError(e);
    return NextResponse.json({ error: err.message, upserted }, { status: 500 });
  }

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.linkedin_topic_tag
  `;

  return NextResponse.json({ ok: true, upserted, total_in_table: n });
}
