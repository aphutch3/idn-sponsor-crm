// Unified LinkedIn feed — the triage surface The Engager was missing.
// Reads scored posts from linkedin_posts, joins to companies/contacts,
// renders sorted by score DESC. Static v1: no filter interactions yet.
import Link from "next/link";
import { admin } from "@/lib/supabase";
import { PageHeader, Badge, Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PostRow = {
  id: string;
  post_urn: string;
  entity_type: "company" | "contact";
  entity_id: string;
  posted_at: string | null;
  post_text: string | null;
  post_url: string | null;
  media_kind: string | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  keyword_hits: string[] | null;
  relevance_score: number | null;
  relevance_topics: string[] | null;
  relevance_reason: string | null;
  scored_at: string | null;
  scorer_model: string | null;
};

type CompanyLite = { id: string; name: string; domain: string | null; linkedin_url: string | null };
type ContactLite = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; company_id: string | null };

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function scoreTone(s: number | null): "success" | "accent" | "warn" | "muted" {
  if (s === null) return "muted";
  if (s >= 70) return "success";
  if (s >= 50) return "accent";
  if (s >= 30) return "warn";
  return "muted";
}

function scoreLabel(s: number | null): string {
  if (s === null) return "—";
  if (s >= 80) return "must-read";
  if (s >= 60) return "notable";
  if (s >= 40) return "worth a look";
  if (s >= 20) return "low signal";
  return "noise";
}

export default async function LinkedinFeedPage() {
  const db = admin();

  // Pull all scored posts (relevance_score IS NOT NULL, i.e. LLM or fallback ran)
  const { data: postsData } = await db
    .from("linkedin_posts")
    .select("*")
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  const posts = (postsData ?? []) as PostRow[];

  // Resolve author entities in one round-trip each
  const companyIds = Array.from(new Set(posts.filter((p) => p.entity_type === "company").map((p) => p.entity_id)));
  const contactIds = Array.from(new Set(posts.filter((p) => p.entity_type === "contact").map((p) => p.entity_id)));

  const [{ data: companiesData }, { data: contactsData }] = await Promise.all([
    companyIds.length > 0
      ? db.from("companies").select("id, name, domain, linkedin_url").in("id", companyIds)
      : Promise.resolve({ data: [] as CompanyLite[] }),
    contactIds.length > 0
      ? db.from("contacts").select("id, full_name, first_name, last_name, company_id").in("id", contactIds)
      : Promise.resolve({ data: [] as ContactLite[] }),
  ]);

  const companyMap = new Map<string, CompanyLite>();
  for (const c of (companiesData ?? []) as CompanyLite[]) companyMap.set(c.id, c);
  const contactMap = new Map<string, ContactLite>();
  for (const c of (contactsData ?? []) as ContactLite[]) contactMap.set(c.id, c);

  // Rollup stats
  const scored = posts.filter((p) => p.relevance_score !== null && p.scorer_model !== "prefilter");
  const worthy = posts.filter((p) => (p.relevance_score ?? 0) >= 50);
  const topScore = posts.reduce((m, p) => Math.max(m, p.relevance_score ?? 0), 0);
  const sourcesCount = new Set(posts.map((p) => `${p.entity_type}:${p.entity_id}`)).size;

  // Distinct topics across the feed (for filter chips later)
  const topicCounts = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.relevance_topics ?? []) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        eyebrow="The Engager · Social"
        title="LinkedIn feed"
        subtitle="Scored posts from every monitored company and person. Highest-signal at the top."
        right={<Badge tone="accent">Static v1 · read-only</Badge>}
      />

      {/* Rollup stats */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Stat label="Scored posts" value={String(scored.length)} sub={`${posts.length} total (incl. prefilter skips)`} />
        <Stat label="Worth a reply" value={String(worthy.length)} sub="score ≥ 50" accent />
        <Stat label="Top score" value={topScore > 0 ? String(topScore) : "—"} sub="highest Sonar rating" />
        <Stat label="Sources" value={String(sourcesCount)} sub="companies + people monitored" />
      </div>

      {/* Filter chips (visual only — not wired) */}
      <div className="mt-8 flex flex-wrap gap-2 items-center">
        <span className="text-[11px] uppercase tracking-wider text-muted mr-2">Filter by topic</span>
        {topTopics.length === 0 ? (
          <span className="text-xs text-muted">No topics yet — run the monitor to populate</span>
        ) : (
          topTopics.map(([slug, n]) => (
            <span
              key={slug}
              className="px-2 py-0.5 rounded-full text-[11px] bg-subtle border border-subtle text-gray-700"
              title={`${n} post(s) mention this topic`}
            >
              {slug} <span className="text-muted ml-1">·{n}</span>
            </span>
          ))
        )}
      </div>

      {/* Feed */}
      <div className="mt-6 space-y-3">
        {posts.length === 0 ? (
          <Card>
            <div className="text-sm text-muted p-4">
              No posts yet. Trigger a Run Now from{" "}
              <Link href="/linkedin-monitor" className="text-blue-600 hover:underline">/linkedin-monitor</Link>{" "}
              or wait for the 6-hourly cron.
            </div>
          </Card>
        ) : (
          posts.map((p) => {
            const author = p.entity_type === "company"
              ? companyMap.get(p.entity_id)
              : contactMap.get(p.entity_id);
            const authorName = p.entity_type === "company"
              ? (author as CompanyLite | undefined)?.name ?? "Unknown company"
              : (author as ContactLite | undefined)?.full_name
                ?? [((author as ContactLite | undefined)?.first_name), ((author as ContactLite | undefined)?.last_name)]
                    .filter(Boolean).join(" ")
                ?? "Unknown person";
            const authorHref = `/${p.entity_type === "company" ? "companies" : "contacts"}/${p.entity_id}`;
            const domain = p.entity_type === "company" ? (author as CompanyLite | undefined)?.domain : null;
            const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
            const isPrefilterSkip = p.scorer_model === "prefilter";
            const isFallback = p.scorer_model === "keyword-fallback";
            const snippet = (p.post_text ?? "").slice(0, 320);

            return (
              <Card key={p.id} padded={false}>
                <div className="grid grid-cols-[64px_1fr_120px] gap-4 p-4">
                  {/* Author avatar */}
                  <div className="flex flex-col items-center gap-1">
                    {faviconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={faviconUrl}
                        alt=""
                        className="w-12 h-12 rounded border border-subtle bg-white"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded border border-subtle bg-subtle flex items-center justify-center text-lg font-semibold text-gray-500">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Post body */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={authorHref} className="text-sm font-semibold hover:underline truncate">
                        {authorName}
                      </Link>
                      <Badge tone="muted">{p.entity_type}</Badge>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-xs text-muted">{fmtAgo(p.posted_at)}</span>
                      {p.post_url && (
                        <>
                          <span className="text-xs text-muted">·</span>
                          <a
                            href={p.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            open on LinkedIn ↗
                          </a>
                        </>
                      )}
                    </div>

                    {isPrefilterSkip ? (
                      <div className="text-xs text-muted italic mt-1">
                        Skipped by prefilter — no IDN keywords in text. Post kept for search/history.
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-4">
                          {snippet}
                          {(p.post_text?.length ?? 0) > 320 ? "…" : ""}
                        </p>

                        {p.relevance_reason && (
                          <div className="mt-2 text-xs text-gray-600 italic">
                            <span className="text-muted not-italic mr-1">Editor take:</span>
                            {p.relevance_reason}
                          </div>
                        )}

                        {/* Topic chips */}
                        {p.relevance_topics && p.relevance_topics.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {p.relevance_topics.map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 border border-blue-100 text-blue-700"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Engagement mini-row */}
                        {(p.reactions || p.comments || p.reposts) && (
                          <div className="mt-2 flex gap-4 text-[11px] text-muted mono">
                            {p.reactions ? <span>♥ {p.reactions.toLocaleString()}</span> : null}
                            {p.comments ? <span>💬 {p.comments.toLocaleString()}</span> : null}
                            {p.reposts ? <span>↻ {p.reposts.toLocaleString()}</span> : null}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Score column */}
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone={scoreTone(p.relevance_score)}>
                      {p.relevance_score !== null ? String(p.relevance_score) : "—"}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      {scoreLabel(p.relevance_score)}
                    </span>
                    {p.scorer_model && !isPrefilterSkip && (
                      <span className="text-[10px] text-muted">
                        {isFallback ? "keyword only" : `via ${p.scorer_model}`}
                      </span>
                    )}
                    {/* Future action — visual only */}
                    <button
                      disabled
                      title="Not wired yet"
                      className="mt-2 px-2 py-1 rounded text-[11px] bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                    >
                      Draft reply
                    </button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Footer note */}
      <div className="mt-8 text-xs text-muted">
        Data source: <code>linkedin_posts</code> table · scored by Perplexity Sonar · gated by 951-tag IDN taxonomy.
        Configure ingest at{" "}
        <Link href="/linkedin-monitor" className="text-blue-600 hover:underline">/linkedin-monitor</Link>.
      </div>
    </div>
  );
}
