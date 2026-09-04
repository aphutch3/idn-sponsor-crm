# idn-sponsor-crm

Agent-driven sponsor CRM for IDN summits. Built on Supabase + Next.js + Vercel.

## Stack

- **Database:** Supabase (Postgres) — project `wpgfanjopuupjcgrdbmb`
- **App:** Next.js 14 (App Router) in `app/`
- **Deploy:** Vercel
- **Repo:** https://github.com/aphutch3/idn-sponsor-crm

## Structure

```
app/                 Next.js app (deployed to Vercel)
migrations/          Baseline Supabase schema (0001_init.sql)
scripts/             CSV → SQL batch generator (build_inserts.py)
data/                Source HubSpot CSVs (gitignored — PII)
```

## Data model (highlights)

- `companies` — 45+ typed sponsor/summit fields, raw HubSpot JSONB preserved
  - `macro_category` → `group` → `subcategory` taxonomy tree
  - `sponsor_tier` + `sponsor_tier_rank` (ordinal sort)
  - `rank_history` parsed into `rank_last_year`, `rank_stage`, `rank_frequency`
  - Derived flags: `is_customer`, `stay_on_top`
- `contacts` — HubSpot fields + `key_contact[]` tags (FRIEND/SPEAKER/TARGET…), engagement counters, `unsubscribed_all_email`
- `activities`, `tasks`, `segments`, `campaigns`, `campaign_sends`, `agent_runs`, `enrichments`
- Views: `v_taxonomy`, `v_key_contacts`, `v_company_stats`

## Featured surfaces

- **/priorities** — Key contacts and stay-on-top customers, both in one focused view
- **/taxonomy** — Three-column Macro → Group → Subcategory browser with live counts and inline company list

## Agent + email endpoints

- `POST /api/agents/research { company_id }` — Perplexity-driven company research, saved to `enrichments` and `agent_runs`
- `POST /api/email/send { contact_id, subject, body_html, campaign_id? }` — Resend delivery with tracking pixel + link wrapping
- `GET /api/email/open?s=<send_id>` — 1x1 open pixel
- `GET /api/email/click?s=<send_id>&u=<url>` — click tracker + redirect

All mutations require `SUPABASE_SERVICE_ROLE_KEY` (server-only). Reads use the anon key with scoped SELECT policies.

## Env

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…   # required for writes/agents
PERPLEXITY_API_KEY=…          # optional; agent falls back to stub
RESEND_API_KEY=…              # optional; email falls back to stub
RESEND_FROM=…
```

## Import a fresh HubSpot export

1. Drop CSVs into `data/`
2. `python scripts/build_inserts.py` → generates `out/*.sql`
3. Run each batch via Supabase — `ON CONFLICT DO UPDATE` on `hubspot_record_id` keeps re-imports idempotent
