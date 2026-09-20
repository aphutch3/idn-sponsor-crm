// LinkedIn monitor orchestrator.
// Consumes lists via list_binding, fetches via Firecrawl, snapshots + diffs,
// emits linkedin_signal rows. Never throws — every error is captured into the
// snapshot row or the config's meta.paused_reason.
//
// Canonical singular tables:
//   list_binding, linkedin_monitor_config, linkedin_snapshot, linkedin_signal
// company/contact resolved from public.company / public.contact.

import { sql } from "@/lib/db";
import { effectiveMembers, type ListId } from "@/lib/lists";
import { firecrawlConfigured } from "@/lib/firecrawl/client";
import { apifyLinkedinConfigured } from "@/lib/apify/linkedin-actors";
import { fetchOne } from "./fetcher";
import { buildUrl, type LinkedinFetchType } from "./urls";
import { parseFetch, type Parsed } from "./parse";
import { diff, hashParsed } from "./diff";
import { runPostsForEntity } from "./posts-pipeline";

export type MonitorRunSummary = {
  readonly config_id: string;
  readonly ran: boolean;
  readonly reason?: string;
  readonly members_considered: number;
  readonly fetches_attempted: number;
  readonly snapshots_written: number;
  readonly signals_emitted: number;
  readonly errors: number;
  readonly paused: boolean;
  readonly next_run_at?: string;
};

type MonitorConfigRow = {
  id: string;
  name: string;
  list_binding_id: string | null;
  fetch_types: LinkedinFetchType[];
  cadence_seconds: number;
  jitter_seconds: number;
  batch_size: number;
  per_fetch_delay_ms: number;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_cursor: { offset?: number } | null;
  meta: Record<string, unknown> | null;
  relevance_min_score: number;
  topic_filter: string[];
  score_posts: boolean;
};

type ListBindingRow = {
  id: string;
  list_id: string;
  honor_suppressions: boolean;
  suppression_list_ids: string[] | null;
};

// Hard cap per invocation regardless of config — Vercel timeout safety.
const GLOBAL_FETCH_CAP = 30;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// -- entity URL lookup: batch resolve linkedin_url per entity_id ------------

async function loadLinkedinUrls(
  entities: readonly { entity_type: "company" | "contact"; entity_id: string }[],
): Promise<Map<string, string | null>> {
  const byType = new Map<"company" | "contact", string[]>();
  for (const e of entities) {
    const arr = byType.get(e.entity_type) ?? [];
    arr.push(e.entity_id);
    byType.set(e.entity_type, arr);
  }

  const out = new Map<string, string | null>();
  for (const [entityType, ids] of byType.entries()) {
    if (ids.length === 0) continue;
    try {
      const rows =
        entityType === "company"
          ? await sql<{ id: string; linkedin_url: string | null }[]>`
              select id, linkedin_url
                from public.company
               where id in ${sql(ids)}
            `
          : await sql<{ id: string; linkedin_url: string | null }[]>`
              select id, linkedin_url
                from public.contact
               where id in ${sql(ids)}
            `;
      for (const row of rows) {
        out.set(`${entityType}:${row.id}`, row.linkedin_url);
      }
    } catch {
      // On lookup failure, leave URLs unresolved — the caller silently skips them.
    }
  }
  return out;
}

// -- prior-snapshot lookup for diff ----------------------------------------

async function loadPriorSnapshot(
  entityType: "company" | "contact",
  entityId: string,
  fetchType: LinkedinFetchType,
): Promise<{ id: string; content_hash: string; parsed: Parsed } | null> {
  try {
    const rows = await sql<{ id: string; content_hash: string; parsed: Parsed }[]>`
      select id, content_hash, parsed
        from public.linkedin_snapshot
       where entity_type = ${entityType}
         and entity_id   = ${entityId}
         and fetch_type  = ${fetchType}
       order by fetched_at desc
       limit 1
    `;
    if (rows.length === 0) return null;
    return { id: rows[0].id, content_hash: rows[0].content_hash, parsed: rows[0].parsed };
  } catch {
    return null;
  }
}

// -- main entry point ------------------------------------------------------

export async function runMonitor(configId: string, opts?: { force?: boolean }): Promise<MonitorRunSummary> {
  const summary = {
    config_id: configId,
    ran: false as boolean,
    members_considered: 0,
    fetches_attempted: 0,
    snapshots_written: 0,
    signals_emitted: 0,
    errors: 0,
    paused: false as boolean,
  };

  // At least one fetcher must be configured. Apify is required for LinkedIn URLs.
  if (!apifyLinkedinConfigured() && !firecrawlConfigured()) {
    return { ...summary, reason: "neither APIFY_TOKEN nor FIRECRAWL_API_KEY is set" };
  }
  if (!apifyLinkedinConfigured()) {
    return { ...summary, reason: "APIFY_TOKEN not set — LinkedIn fetches will fail" };
  }

  let config: MonitorConfigRow;
  try {
    const rows = await sql<MonitorConfigRow[]>`
      select id, name, list_binding_id, fetch_types, cadence_seconds, jitter_seconds,
             batch_size, per_fetch_delay_ms, active, last_run_at, next_run_at,
             run_cursor, meta, relevance_min_score, topic_filter, score_posts
        from public.linkedin_monitor_config
       where id = ${configId}
       limit 1
    `;
    if (rows.length === 0) return { ...summary, reason: "config not found: no row" };
    config = rows[0];
  } catch (e) {
    return { ...summary, reason: `config not found: ${(e as Error).message}` };
  }

  if (!config.active && !opts?.force) return { ...summary, reason: "config inactive" };
  if (!config.list_binding_id) return { ...summary, reason: "config has no list_binding_id" };

  let bind: ListBindingRow;
  try {
    const rows = await sql<ListBindingRow[]>`
      select id, list_id, honor_suppressions, suppression_list_ids
        from public.list_binding
       where id = ${config.list_binding_id}
       limit 1
    `;
    if (rows.length === 0) return { ...summary, reason: "list binding not found: no row" };
    bind = rows[0];
  } catch (e) {
    return { ...summary, reason: `list binding not found: ${(e as Error).message}` };
  }

  const membersRes = await effectiveMembers(bind.list_id as ListId, {
    honor_suppressions: bind.honor_suppressions,
    suppression_list_ids: bind.suppression_list_ids?.length
      ? (bind.suppression_list_ids as ListId[])
      : undefined,
  });
  if (!membersRes.ok) return { ...summary, reason: `effectiveMembers failed: ${membersRes.error.kind}` };

  const members = membersRes.value;
  summary.members_considered = members.length;
  if (members.length === 0) {
    const nowIso = new Date().toISOString();
    const nextRunAt = new Date(Date.now() + config.cadence_seconds * 1000).toISOString();
    try {
      await sql`
        update public.linkedin_monitor_config
           set last_run_at = ${nowIso},
               next_run_at = ${nextRunAt},
               updated_at  = now()
         where id = ${config.id}
      `;
    } catch {
      // swallow — reporting the empty-list case is more useful than the update
    }
    return { ...summary, ran: true, reason: "list has 0 effective members" };
  }

  // Round-robin cursor over the list
  const priorOffset = Math.max(0, config.run_cursor?.offset ?? 0) % members.length;
  const batchSize = Math.max(1, Math.min(config.batch_size, GLOBAL_FETCH_CAP));
  const batch: (typeof members)[number][] = [];
  for (let i = 0; i < batchSize && i < members.length; i++) {
    batch.push(members[(priorOffset + i) % members.length]!);
  }
  const newOffset = (priorOffset + batch.length) % members.length;

  const urlMap = await loadLinkedinUrls(batch);

  let fetchesInTick = 0;
  let paused = false;
  let pausedReason: string | undefined;

  outer: for (const member of batch) {
    const linkedinUrl = urlMap.get(`${member.entity_type}:${member.entity_id}`) ?? null;

    for (const fetchType of config.fetch_types) {
      if (fetchesInTick >= GLOBAL_FETCH_CAP) break outer;

      // ------------------------------------------------------------------
      // Posts fetch types: parallel pipeline (dedup by post_urn, score with
      // Perplexity, emit new_post signals). Does NOT touch linkedin_snapshot.
      // ------------------------------------------------------------------
      const isCompanyPosts = fetchType === "company_posts" && member.entity_type === "company";
      const isProfilePosts = fetchType === "profile_activity" && member.entity_type === "contact";
      if (isCompanyPosts || isProfilePosts) {
        if (!linkedinUrl) continue; // no URL, silently skip
        if (fetchesInTick > 0) await sleep(Math.max(0, config.per_fetch_delay_ms));
        fetchesInTick++;
        summary.fetches_attempted++;

        const res = await runPostsForEntity({
          entity_type: member.entity_type,
          entity_id: member.entity_id,
          linkedin_url: linkedinUrl,
          monitor_config_id: config.id,
          relevance_min_score: config.relevance_min_score,
          topic_filter: config.topic_filter?.length ? config.topic_filter : undefined,
          score_posts: config.score_posts,
        });

        if (!res.ok) {
          summary.errors++;
          if (res.rate_limited || res.blocked) {
            paused = true;
            pausedReason = `posts pipeline ${res.blocked ? "blocked" : "rate-limited"}: ${res.error}`;
            break outer;
          }
        } else {
          summary.signals_emitted += res.signals_emitted;
        }
        continue; // done with this fetchType for this member
      }

      const built = buildUrl(member.entity_type, fetchType, linkedinUrl);
      if (!built.ok) continue; // silently skip: no URL for this combo

      // Polite delay between calls
      if (fetchesInTick > 0) await sleep(Math.max(0, config.per_fetch_delay_ms));

      fetchesInTick++;
      summary.fetches_attempted++;

      const scrape = await fetchOne(built.url, fetchType);

      const nowIso = new Date().toISOString();

      if (!scrape.success) {
        // Persist failed snapshot for observability
        try {
          await sql`
            insert into public.linkedin_snapshot
              (entity_type, entity_id, fetch_type, source_url, http_status,
               content_hash, parsed, monitor_config_id, error, fetched_at)
            values
              (${member.entity_type},
               ${member.entity_id},
               ${fetchType},
               ${built.url},
               ${scrape.status_code ?? null},
               ${"error"},
               ${sql.json({} as unknown as Parameters<typeof sql.json>[0])},
               ${config.id},
               ${scrape.error ?? null},
               ${nowIso})
          `;
        } catch {
          // if the insert itself fails, still count the error and keep going
        }
        summary.errors++;

        // Pause the config if LinkedIn is signaling us to back off
        if (scrape.rate_limited || scrape.blocked) {
          paused = true;
          pausedReason = `LinkedIn ${scrape.blocked ? "blocked" : "rate-limited"}: ${scrape.error}`;
          break outer;
        }
        continue;
      }

      const parsed = parseFetch(fetchType, scrape.markdown, scrape.metadata);
      const hash = hashParsed(parsed);

      const prior = await loadPriorSnapshot(member.entity_type, member.entity_id, fetchType);

      let inserted: { id: string } | null = null;
      try {
        const rows = await sql<{ id: string }[]>`
          insert into public.linkedin_snapshot
            (entity_type, entity_id, fetch_type, source_url, http_status,
             content_hash, parsed, monitor_config_id, fetched_at)
          values
            (${member.entity_type},
             ${member.entity_id},
             ${fetchType},
             ${built.url},
             ${scrape.status_code},
             ${hash},
             ${sql.json(parsed as unknown as Parameters<typeof sql.json>[0])},
             ${config.id},
             ${nowIso})
          returning id
        `;
        inserted = rows[0] ?? null;
      } catch {
        summary.errors++;
        continue;
      }
      if (!inserted) {
        summary.errors++;
        continue;
      }
      summary.snapshots_written++;

      if (prior && prior.content_hash !== hash) {
        const signals = diff(prior.parsed, parsed);
        if (signals.length > 0) {
          try {
            const signalRows = signals.map((s) => ({
              entity_type: member.entity_type,
              entity_id: member.entity_id,
              snapshot_id: inserted!.id,
              prior_snapshot_id: prior.id,
              signal_kind: s.signal_kind,
              before_value: s.before_value as unknown,
              after_value: s.after_value as unknown,
              meta: { field: s.field } as unknown,
            }));
            await sql`
              insert into public.linkedin_signal ${sql(
                signalRows as unknown as Parameters<typeof sql>[0],
                "entity_type",
                "entity_id",
                "snapshot_id",
                "prior_snapshot_id",
                "signal_kind",
                "before_value",
                "after_value",
                "meta",
              )}
            `;
            summary.signals_emitted += signalRows.length;
          } catch {
            summary.errors++;
          }
        }
      }
    }
  }

  // Advance cursor + schedule next run
  const jitter = Math.floor(Math.random() * Math.max(0, config.jitter_seconds)) * 1000;
  const nextRunAt = paused
    ? null
    : new Date(Date.now() + config.cadence_seconds * 1000 + jitter).toISOString();

  const nextCursor = { ...(config.run_cursor ?? {}), offset: newOffset };
  const nowIso = new Date().toISOString();

  try {
    if (paused) {
      const nextMeta = {
        ...(config.meta ?? {}),
        paused_reason: pausedReason,
        paused_at: nowIso,
      };
      await sql`
        update public.linkedin_monitor_config
           set last_run_at = ${nowIso},
               run_cursor  = ${sql.json(nextCursor as unknown as Parameters<typeof sql.json>[0])},
               active      = false,
               meta        = ${sql.json(nextMeta as unknown as Parameters<typeof sql.json>[0])},
               updated_at  = now()
         where id = ${config.id}
      `;
    } else {
      await sql`
        update public.linkedin_monitor_config
           set last_run_at = ${nowIso},
               run_cursor  = ${sql.json(nextCursor as unknown as Parameters<typeof sql.json>[0])},
               next_run_at = ${nextRunAt},
               updated_at  = now()
         where id = ${config.id}
      `;
    }
  } catch {
    // Don't fail the entire run just because we couldn't update the cursor;
    // the summary is still meaningful to the caller.
  }

  return {
    ...summary,
    ran: true,
    paused,
    ...(paused ? { reason: pausedReason } : {}),
    ...(nextRunAt ? { next_run_at: nextRunAt } : {}),
  };
}

/** Cron worker: run all configs whose next_run_at is due. */
export async function runDueConfigs(opts?: { max_configs?: number }): Promise<{
  configs_processed: number;
  summaries: MonitorRunSummary[];
}> {
  const maxConfigs = Math.max(1, Math.min(opts?.max_configs ?? 5, 10));

  let due: { id: string }[] = [];
  try {
    due = await sql<{ id: string }[]>`
      select id
        from public.linkedin_monitor_config
       where active = true
         and next_run_at <= now()
       order by next_run_at asc
       limit ${maxConfigs}
    `;
  } catch {
    return { configs_processed: 0, summaries: [] };
  }

  const summaries: MonitorRunSummary[] = [];
  for (const row of due) {
    summaries.push(await runMonitor(row.id));
  }
  return { configs_processed: summaries.length, summaries };
}
