// Diagnostic route: runs a battery of quick queries against the canonical
// Neon database and returns raw {ok, count, sample, error} results. Useful
// for verifying schema parity and connection health.
//
// GET /api/admin/db-diag?secret=<CRON_SECRET>
//
// Canonical singular: public.company / public.contact / public.tag / ...

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Probe = {
  name: string;
  // Return whatever shape the probe wants; the runner records it.
  run: () => Promise<{ count?: number | null; sample?: unknown }>;
};

const probes: Probe[] = [
  {
    name: "tag.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.tag`;
      return { count: n };
    },
  },
  {
    name: "company.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.company`;
      return { count: n };
    },
  },
  {
    name: "contact.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.contact`;
      return { count: n };
    },
  },
  {
    name: "social_mention.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.social_mention`;
      return { count: n };
    },
  },
  {
    name: "linkedin_post.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.linkedin_post`;
      return { count: n };
    },
  },
  {
    name: "list.select 3",
    run: async () => {
      const rows = await sql`select id, name, kind from public.list limit 3`;
      return { sample: rows };
    },
  },
  {
    name: "tag.select 3",
    run: async () => {
      const rows = await sql`select slug, label from public.tag limit 3`;
      return { sample: rows };
    },
  },
  {
    name: "campaign_send.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.campaign_send`;
      return { count: n };
    },
  },
  {
    name: "linkedin_signal.count",
    run: async () => {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.linkedin_signal`;
      return { count: n };
    },
  },
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, { ok: boolean; count?: number | null; error?: string; sample?: unknown }> = {};

  for (const p of probes) {
    try {
      const r = await p.run();
      results[p.name] = { ok: true, count: r.count ?? null, sample: r.sample };
    } catch (err) {
      results[p.name] = { ok: false, error: (err as Error).message };
    }
  }

  return NextResponse.json({
    db_target: "canonical-neon",
    node_env: process.env.NODE_ENV,
    results,
  });
}
