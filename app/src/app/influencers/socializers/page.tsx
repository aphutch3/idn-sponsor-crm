import Link from "next/link";
import { admin } from "@/lib/supabase";
import { PageHeader, Badge, Stat, Card, TableShell } from "@/components/ui";
import { fmtNum } from "@/lib/utils";
import { RefreshMentionsButton } from "@/components/refresh-mentions-button";

export const revalidate = 30;

// ---------- Curated top-tier socializers (wishlist / watchlist) ---------- //
// High-reach public voices on X, LinkedIn, and YouTube whose posts move
// enterprise IT conversations. Not yet in Supabase — hardcoded until schema lands.
const WATCHLIST = [
  { handle: "@simonw",         name: "Simon Willison",         platform: "X" as const,        followers: 62000,  topics: ["LLM tooling","Prompt eval","Datasette"],           url: "https://x.com/simonw",         priority: "high" as const },
  { handle: "@karpathy",       name: "Andrej Karpathy",        platform: "X" as const,        followers: 1_200_000, topics: ["Foundation models","Nanochat","LLM education"], url: "https://x.com/karpathy",       priority: "high" as const },
  { handle: "@mitchellh",      name: "Mitchell Hashimoto",     platform: "X" as const,        followers: 178000, topics: ["IaC","Ghostty","Founder"],                          url: "https://x.com/mitchellh",      priority: "high" as const },
  { handle: "@rauchg",         name: "Guillermo Rauch",        platform: "X" as const,        followers: 246000, topics: ["Frontend AI","Vercel","DevEx"],                     url: "https://x.com/rauchg",         priority: "high" as const },
  { handle: "@kelseyhightower",name: "Kelsey Hightower",       platform: "X" as const,        followers: 199000, topics: ["Platform","Kubernetes","DevEx"],                    url: "https://x.com/kelseyhightower",priority: "high" as const },
  { handle: "@dhh",            name: "David Heinemeier Hansson", platform: "X" as const,      followers: 480000, topics: ["Rails","Cloud exit","Opinion"],                     url: "https://x.com/dhh",            priority: "medium" as const },
  { handle: "@mipsytipsy",     name: "Charity Majors",         platform: "X" as const,        followers: 66000,  topics: ["Observability","On-call","Engineering leadership"], url: "https://x.com/mipsytipsy",     priority: "high" as const },
  { handle: "ashley-willis",   name: "Ashley Willis",          platform: "LinkedIn" as const, followers: 42000,  topics: ["Developer advocacy","GitHub","Copilot"],            url: "https://linkedin.com/in/ashleymcnamara", priority: "high" as const },
  { handle: "@swyx",           name: "Shawn Wang (swyx)",      platform: "X" as const,        followers: 108000, topics: ["AI engineering","Latent Space","DevEx"],            url: "https://x.com/swyx",           priority: "high" as const },
  { handle: "@fireship_dev",   name: "Jeff Delaney (Fireship)",platform: "YouTube" as const,  followers: 3_800_000, topics: ["Dev explainers","Trends","Frameworks"],         url: "https://youtube.com/@Fireship", priority: "medium" as const },
  { handle: "@theprimeagen",   name: "The Primeagen",          platform: "YouTube" as const,  followers: 900000, topics: ["Rust","Vim","Dev culture"],                         url: "https://youtube.com/@ThePrimeagen", priority: "medium" as const },
  { handle: "@martinfowler",   name: "Martin Fowler",          platform: "X" as const,        followers: 340000, topics: ["Architecture","Refactoring","AI eng"],              url: "https://x.com/martinfowler",   priority: "high" as const },
  { handle: "adam-jacob",      name: "Adam Jacob",             platform: "LinkedIn" as const, followers: 24000,  topics: ["Infra","System Initiative","DevOps"],               url: "https://linkedin.com/in/adamhjk", priority: "medium" as const },
  { handle: "@housecor",       name: "Cory House",             platform: "X" as const,        followers: 88000,  topics: ["Frontend","React","Careers"],                       url: "https://x.com/housecor",       priority: "low" as const },
  { handle: "@shubhro",        name: "Shubhro Saha",           platform: "X" as const,        followers: 12000,  topics: ["AI infra","Startup"],                               url: "https://x.com/shubhro",        priority: "low" as const },
  { handle: "@ashtom",         name: "Thomas Dohmke",          platform: "X" as const,        followers: 74000,  topics: ["GitHub","Copilot","AI dev"],                        url: "https://x.com/ashtom",         priority: "high" as const },
  { handle: "@GergelyOrosz",   name: "Gergely Orosz",          platform: "X" as const,        followers: 245000, topics: ["Pragmatic Engineer","Careers","Tech industry"],     url: "https://x.com/GergelyOrosz",   priority: "high" as const },
  { handle: "@svpino",         name: "Santiago",               platform: "X" as const,        followers: 168000, topics: ["ML","MLOps","Careers"],                             url: "https://x.com/svpino",         priority: "medium" as const },
];

// Recent mentions are now live from the social_mentions table — populated by
// scripts/refresh_social_mentions.py on a 6h cron.
type Mention = {
  id: string;
  platform: "X" | "LinkedIn" | "YouTube";
  author_username: string | null;
  author_name: string | null;
  text: string;
  url: string | null;
  topic: string | null;
  reach_score: number;
  posted_at: string;
  impression_count: number;
  like_count: number;
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

type Platform = "X" | "LinkedIn" | "YouTube";

function platformTone(p: Platform) {
  if (p === "X") return "default" as const;
  if (p === "LinkedIn") return "accent" as const;
  return "warn" as const;
}

function priorityTone(p: "high" | "medium" | "low") {
  if (p === "high") return "success" as const;
  if (p === "medium") return "warn" as const;
  return "muted" as const;
}

function fmtFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

type Tab = "reach" | "posts" | "platform";

export default async function SocializersPage({ searchParams }: { searchParams: { tab?: string; platform?: string; q?: string } }) {
  const tab = (searchParams.tab === "posts" || searchParams.tab === "platform") ? (searchParams.tab as Tab) : "reach";
  const platformFilter = (searchParams.platform || "all") as "all" | Platform;
  const q = (searchParams.q || "").trim();

  const db = admin();

  // Seed roster: FRIEND-tagged contacts with LinkedIn URLs — real people we
  // already have relationships with who publish on LinkedIn.
  let seedQ = db.from("contacts")
    .select("id, first_name, last_name, job_title, linkedin_url, lead_status, emails_opened, key_contact, companies(id, name)")
    .contains("key_contact", ["FRIEND"])
    .not("linkedin_url", "is", null)
    .order("emails_opened", { ascending: false, nullsFirst: false });
  if (q) seedQ = seedQ.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,job_title.ilike.%${q}%`);
  const { data: seed } = await seedQ.limit(50);

  // KPIs
  const { count: friendCount } = await db.from("contacts").select("id", { count: "exact", head: true }).contains("key_contact", ["FRIEND"]).not("linkedin_url", "is", null);
  const totalReach = WATCHLIST.reduce((s, w) => s + w.followers, 0);
  const highPriority = WATCHLIST.filter((w) => w.priority === "high").length;

  // Live recent mentions from social_mentions (populated by 6h xurl cron)
  const { data: mentions } = await db.from("social_mentions")
    .select("id, platform, author_username, author_name, text, url, topic, reach_score, posted_at, impression_count, like_count")
    .order("posted_at", { ascending: false })
    .limit(25);

  // Latest refresh log entry for the "last synced" indicator
  const { data: lastLog } = await db.from("social_refresh_log")
    .select("ran_at, posts_inserted, queries_run")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  // Filter for platform tab
  const byPlatform = platformFilter === "all"
    ? WATCHLIST
    : WATCHLIST.filter((w) => w.platform === platformFilter);
  const platformStats: Record<Platform, { count: number; reach: number }> = {
    X:        { count: WATCHLIST.filter(w => w.platform === "X").length,        reach: WATCHLIST.filter(w => w.platform === "X").reduce((s,w)=>s+w.followers,0) },
    LinkedIn: { count: WATCHLIST.filter(w => w.platform === "LinkedIn").length, reach: WATCHLIST.filter(w => w.platform === "LinkedIn").reduce((s,w)=>s+w.followers,0) },
    YouTube:  { count: WATCHLIST.filter(w => w.platform === "YouTube").length,  reach: WATCHLIST.filter(w => w.platform === "YouTube").reduce((s,w)=>s+w.followers,0) },
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <Link href="/influencers" className="hover:text-strong">Influencers</Link>
        <span>/</span>
        <span className="text-strong">Socializers</span>
      </div>

      <PageHeader
        eyebrow="Influencers"
        title="Socializers"
        subtitle="High-reach voices on X, LinkedIn, and YouTube — the people whose posts move enterprise IT conversations."
        right={<Badge tone="success">Live · watchlist + {fmtNum(friendCount || 0)} FRIEND seeds</Badge>}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Stat label="Watchlist" value={`${WATCHLIST.length}`} sub="top-tier voices" />
        <Stat label="Combined reach" value={fmtFollowers(totalReach)} sub="followers across platforms" />
        <Stat label="High priority" value={`${highPriority}`} sub="brief before major launches" />
        <Stat label="FRIEND seeds" value={fmtNum(friendCount || 0)} sub="contacts with LinkedIn" accent />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mt-8 border-b border-subtle">
        <TabLink label="Top reach"    tab="reach"    current={tab} count={WATCHLIST.length} />
        <TabLink label="Recent posts" tab="posts"    current={tab} count={mentions?.length || 0} />
        <TabLink label="By platform"  tab="platform" current={tab} count={3} />
      </div>

      {tab === "reach" && (
        <div className="mt-6">
          <div className="text-xs text-muted mb-4">Curated watchlist ranked by follower reach across X, LinkedIn, and YouTube. Ordering by combined reach; click a handle to open their profile.</div>
          <Card padded={false}>
            <div className="grid grid-cols-[2fr_120px_1.6fr_100px_100px] text-[11px] uppercase tracking-wider text-muted border-b border-subtle px-4 py-2.5 bg-subtle/40 gap-3">
              <div>Socializer</div>
              <div>Platform</div>
              <div>Topics</div>
              <div className="text-right">Followers</div>
              <div className="text-right">Priority</div>
            </div>
            {[...WATCHLIST].sort((a, b) => b.followers - a.followers).map((w) => (
              <div key={`${w.platform}-${w.handle}`} className="grid grid-cols-[2fr_120px_1.6fr_100px_100px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40">
                <div>
                  <a href={w.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-accent">{w.name}</a>
                  <div className="text-xs text-muted mono">{w.handle}</div>
                </div>
                <div><Badge tone={platformTone(w.platform)}>{w.platform}</Badge></div>
                <div className="flex flex-wrap gap-1">
                  {w.topics.slice(0, 3).map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
                </div>
                <div className="text-right mono text-sm">{fmtFollowers(w.followers)}</div>
                <div className="text-right"><Badge tone={priorityTone(w.priority)}>{w.priority}</Badge></div>
              </div>
            ))}
          </Card>

          {/* FRIEND seed roster below the watchlist */}
          {seed && seed.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm uppercase tracking-wider text-muted mb-3">FRIEND-tagged seeds with LinkedIn ({fmtNum(friendCount || 0)})</h4>
              <div className="text-xs text-muted mb-3">Real contacts we already know who publish on LinkedIn. Promote any of these into the watchlist as they scale their reach.</div>
              <TableShell>
                <thead className="text-xs uppercase text-muted border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Contact</th>
                    <th className="text-left px-4 py-2 font-medium">Company</th>
                    <th className="text-left px-4 py-2 font-medium">Title</th>
                    <th className="text-left px-4 py-2 font-medium">LinkedIn</th>
                    <th className="text-right px-4 py-2 font-medium">Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {seed.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
                      <td className="px-4 py-2">
                        <Link href={`/contacts/${c.id}`} className="hover:text-accent font-medium text-sm">
                          {c.first_name} {c.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {c.companies ? (
                          <Link href={`/companies/${c.companies.id}`} className="hover:text-accent">{c.companies.name}</Link>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-2 text-muted text-xs">{c.job_title || "—"}</td>
                      <td className="px-4 py-2">
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-xs hover:text-accent">Profile ↗</a>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right mono text-xs text-muted">{c.emails_opened || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          )}
        </div>
      )}

      {tab === "posts" && (
        <div className="mt-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="text-xs text-muted max-w-2xl">Live X posts matching IDN topic searches, refreshed every 6 hours by <code className="mono">refresh_social_mentions.py</code>. Ranked by recency; use By platform tab for reach-ranked lists.</div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <RefreshMentionsButton />
              <div className="text-xs text-muted">
                {lastLog ? (
                  <>Last synced: {timeAgo(lastLog.ran_at)} · {lastLog.posts_inserted} posts · {lastLog.queries_run} queries</>
                ) : "Never synced"}
              </div>
            </div>
          </div>
          {(!mentions || mentions.length === 0) ? (
            <Card>
              <div className="text-sm text-muted">No mentions yet. Run <code className="mono">python3 scripts/refresh_social_mentions.py</code> or wait for the 6h cron.</div>
            </Card>
          ) : (
            <Card padded={false}>
              {(mentions as Mention[]).map((m) => (
                <div key={m.id} className="grid grid-cols-[130px_1fr_130px_100px] gap-4 px-4 py-4 border-b border-subtle last:border-b-0 items-start">
                  <div className="flex flex-col gap-1">
                    <Badge tone={platformTone(m.platform)}>{m.platform}</Badge>
                    {m.author_username && (
                      <a href={m.url || `https://x.com/${m.author_username}`} target="_blank" rel="noreferrer" className="text-xs text-muted mono hover:text-accent">
                        @{m.author_username}
                      </a>
                    )}
                    {m.author_name && (
                      <span className="text-[11px] text-muted truncate" title={m.author_name}>{m.author_name}</span>
                    )}
                  </div>
                  <div className="text-sm leading-relaxed">
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noreferrer" className="hover:text-accent">{m.text}</a>
                    ) : m.text}
                  </div>
                  <div className="text-xs">
                    {m.topic && <Badge tone="muted">{m.topic}</Badge>}
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm">{fmtFollowers(m.impression_count || 0)}</div>
                    <div className="text-[11px] text-muted">impressions</div>
                    <div className="text-[11px] text-muted mt-1">{timeAgo(m.posted_at)}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}
          <div className="mt-4 p-3 border border-border rounded-md bg-subtle/40 text-xs text-muted">
            <strong className="text-fg">Pipeline:</strong> xurl searches 8 IDN topic queries (Copilot, LLM tooling, Observability, Platform eng, AI coding, Tech debt, Frontend AI, Foundation models). Posts with ≥200 impressions are upserted into <code className="mono">social_mentions</code>. Reach score = impressions + likes×10 + retweets×30 + quotes×20 + replies×5.
          </div>
        </div>
      )}

      {tab === "platform" && (
        <div className="mt-6">
          {/* Platform pill selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            <PlatformPill label="All"      slug="all"      current={platformFilter} count={WATCHLIST.length} />
            <PlatformPill label="X"        slug="X"        current={platformFilter} count={platformStats.X.count} />
            <PlatformPill label="LinkedIn" slug="LinkedIn" current={platformFilter} count={platformStats.LinkedIn.count} />
            <PlatformPill label="YouTube"  slug="YouTube"  current={platformFilter} count={platformStats.YouTube.count} />
          </div>

          {/* Per-platform stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <div className="text-xs uppercase tracking-wider text-muted">X</div>
              <div className="tk-editorial text-2xl mt-1">{platformStats.X.count}</div>
              <div className="text-xs text-muted mt-1">Combined reach: {fmtFollowers(platformStats.X.reach)}</div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-wider text-muted">LinkedIn</div>
              <div className="tk-editorial text-2xl mt-1">{platformStats.LinkedIn.count}</div>
              <div className="text-xs text-muted mt-1">Combined reach: {fmtFollowers(platformStats.LinkedIn.reach)}</div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-wider text-muted">YouTube</div>
              <div className="tk-editorial text-2xl mt-1">{platformStats.YouTube.count}</div>
              <div className="text-xs text-muted mt-1">Combined reach: {fmtFollowers(platformStats.YouTube.reach)}</div>
            </Card>
          </div>

          <h4 className="text-sm uppercase tracking-wider text-muted mb-3">
            {platformFilter === "all" ? "All platforms" : platformFilter} ({byPlatform.length})
          </h4>
          <Card padded={false}>
            {byPlatform.sort((a, b) => b.followers - a.followers).map((w) => (
              <div key={`${w.platform}-${w.handle}`} className="grid grid-cols-[2fr_120px_1.6fr_100px_100px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40">
                <div>
                  <a href={w.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-accent">{w.name}</a>
                  <div className="text-xs text-muted mono">{w.handle}</div>
                </div>
                <div><Badge tone={platformTone(w.platform)}>{w.platform}</Badge></div>
                <div className="flex flex-wrap gap-1">
                  {w.topics.slice(0, 3).map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
                </div>
                <div className="text-right mono text-sm">{fmtFollowers(w.followers)}</div>
                <div className="text-right"><Badge tone={priorityTone(w.priority)}>{w.priority}</Badge></div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function TabLink({ label, tab, current, count }: { label: string; tab: Tab; current: Tab; count: number }) {
  const active = tab === current;
  return (
    <Link
      href={`/influencers/socializers?tab=${tab}`}
      className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active ? "border-accent text-strong font-medium" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {label} <span className="text-xs text-muted ml-1">({fmtNum(count)})</span>
    </Link>
  );
}

function PlatformPill({ label, slug, current, count }: { label: string; slug: string; current: string; count: number }) {
  const active = slug === current;
  return (
    <Link
      href={`/influencers/socializers?tab=platform&platform=${slug}`}
      className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
        active
          ? "bg-accent text-accentfg border-accent"
          : "border-border text-muted hover:border-strong hover:text-fg"
      }`}
    >
      {label} <span className="text-xs opacity-70 ml-1">({count})</span>
    </Link>
  );
}
