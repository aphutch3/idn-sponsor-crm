import Link from "next/link";
import { admin } from "@/lib/supabase";
import { PageHeader, Badge, Stat, Card, TableShell } from "@/components/ui";
import { fmtNum } from "@/lib/utils";

export const revalidate = 30;

// ---------- Prospects (curated wishlist — not in Supabase yet) ---------- //
// These are ideal speakers we want to land for future summits.
// Editable inline; will move to Supabase once schema lands.
const PROSPECTS = [
  { name: "Charity Majors",      title: "CTO & Co-founder",              company: "Honeycomb",       topics: ["Observability","SRE","AI eval"], targetSummit: "AI Ops 2026",         status: "invited",   lastTouch: "2026-08-14" },
  { name: "Kelsey Hightower",    title: "Independent",                   company: "—",               topics: ["Platform","Kubernetes","DevEx"], targetSummit: "AI Platforms 2026",   status: "confirmed", lastTouch: "2026-09-02" },
  { name: "Simon Willison",      title: "Independent · Datasette",       company: "—",               topics: ["LLM tooling","Prompt eval"],     targetSummit: "AI Apps 2026",        status: "researching", lastTouch: "2026-08-30" },
  { name: "Adam Jacob",          title: "CEO",                           company: "System Initiative", topics: ["DevOps","Infra","AI"],         targetSummit: "AI Platforms 2026",   status: "researching", lastTouch: "—" },
  { name: "Erica Brescia",       title: "Managing Director",             company: "Redpoint",         topics: ["OSS commercial","Infra funding"], targetSummit: "AI Investors Salon", status: "invited",   lastTouch: "2026-08-21" },
  { name: "Armon Dadgar",        title: "Co-founder & CTO",              company: "HashiCorp",        topics: ["IaC","Zero trust","Multi-cloud"], targetSummit: "AI Platforms 2026",  status: "researching", lastTouch: "—" },
  { name: "Guillermo Rauch",     title: "CEO",                           company: "Vercel",           topics: ["Frontend AI","DevEx","Framework economics"], targetSummit: "AI Apps 2026", status: "invited", lastTouch: "2026-08-05" },
  { name: "Solomon Hykes",       title: "Founder",                       company: "Dagger",           topics: ["Build systems","Container tooling"], targetSummit: "AI Platforms 2026", status: "researching", lastTouch: "—" },
  { name: "Ashley Willis",       title: "VP Advocacy",                   company: "GitHub",           topics: ["Copilot","Dev productivity"],    targetSummit: "AI Coding Tools 2026", status: "invited",   lastTouch: "2026-08-27" },
  { name: "Andrej Karpathy",     title: "Founder",                       company: "Eureka Labs",      topics: ["Foundation models","Nanochat","LLM education"], targetSummit: "AI Apps 2026", status: "researching", lastTouch: "—" },
  { name: "Dan Abramov",         title: "Independent",                   company: "—",               topics: ["React","Framework design"],       targetSummit: "AI Apps 2026",        status: "researching", lastTouch: "—" },
  { name: "Ted Young",           title: "OpenTelemetry Governance",      company: "Splunk",           topics: ["OpenTelemetry","Observability standards"], targetSummit: "AI Ops 2026", status: "invited", lastTouch: "2026-08-19" },
];

// ---------- Planned summit programming ---------- //
// Each summit lists the topics/tracks we're building. Speakers pulled from
// SPEAKER-tagged Contacts + Prospects assigned to that summit.
const SUMMITS = [
  { slug: "ai-platforms-2026",  name: "AI Platforms 2026",    when: "Nov 2026",  tracks: ["Agent runtimes","Vector infra","Platform economics"] },
  { slug: "ai-apps-2026",       name: "AI Apps 2026",         when: "Dec 2026",  tracks: ["Frontend AI","Coding agents","LLM UX"] },
  { slug: "ai-ops-2026",        name: "AI Ops 2026",          when: "Feb 2027",  tracks: ["Observability","Evals","On-call automation"] },
  { slug: "ai-coding-tools-2026", name: "AI Coding Tools 2026", when: "Mar 2027", tracks: ["Copilot patterns","Test generation","Refactor at scale"] },
  { slug: "ai-investors-salon", name: "AI Investors Salon",   when: "Apr 2027",  tracks: ["Infra bets","OSS commercial models","Enterprise adoption"] },
];

function statusTone(s: string) {
  if (s === "confirmed") return "success" as const;
  if (s === "invited") return "warn" as const;
  return "muted" as const;
}

type Tab = "roster" | "prospects" | "summit";

export default async function SpeakersPage({ searchParams }: { searchParams: { tab?: string; q?: string; summit?: string } }) {
  const tab = (searchParams.tab === "prospects" || searchParams.tab === "summit") ? (searchParams.tab as Tab) : "roster";
  const q = (searchParams.q || "").trim();
  const summitSlug = searchParams.summit || SUMMITS[0].slug;

  const db = admin();

  // Roster query — real SPEAKER-tagged contacts
  let rosterQ = db.from("contacts")
    .select("id, first_name, last_name, email, job_title, lead_status, emails_opened, emails_clicked, emails_replied, key_contact, company_id, companies(id, name)")
    .contains("key_contact", ["SPEAKER"])
    .order("emails_opened", { ascending: false, nullsFirst: false });
  if (q) rosterQ = rosterQ.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,job_title.ilike.%${q}%`);
  const { data: roster, count: rosterCount } = await rosterQ.limit(200);

  // KPIs for the header
  const { count: totalSpeakers } = await db.from("contacts").select("id", { count: "exact", head: true }).contains("key_contact", ["SPEAKER"]);
  const { count: openStatus } = await db.from("contacts").select("id", { count: "exact", head: true }).contains("key_contact", ["SPEAKER"]).eq("lead_status", "Open");

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <Link href="/influencers" className="hover:text-strong">Influencers</Link>
        <span>/</span>
        <span className="text-strong">Event Speakers</span>
      </div>

      <PageHeader
        eyebrow="Influencers"
        title="Event Speakers"
        subtitle="Past, confirmed, and prospective summit speakers — with outreach status, session history, and topic coverage."
        right={<Badge tone="success">Live · pulling {fmtNum(totalSpeakers || 0)} tagged contacts</Badge>}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Stat label="Speaker roster" value={fmtNum(totalSpeakers || 0)} sub="SPEAKER-tagged contacts" />
        <Stat label="Prospects" value={`${PROSPECTS.length}`} sub="curated wishlist" />
        <Stat label="Active outreach" value={fmtNum(openStatus || 0)} sub="lead status Open" />
        <Stat label="Planned summits" value={`${SUMMITS.length}`} sub="programming slate" accent />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mt-8 border-b border-subtle">
        <TabLink label="Roster"    tab="roster"    current={tab} count={totalSpeakers || 0} />
        <TabLink label="Prospects" tab="prospects" current={tab} count={PROSPECTS.length} />
        <TabLink label="By summit" tab="summit"    current={tab} count={SUMMITS.length} />
      </div>

      {tab === "roster" && (
        <div className="mt-6">
          <form className="flex flex-wrap gap-2 mb-4">
            <input type="hidden" name="tab" value="roster" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, email, title…"
              className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button className="bg-accent text-accentfg px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90">Apply</button>
            {q && <Link href="/influencers/speakers?tab=roster" className="text-sm text-muted hover:text-fg self-center">Clear</Link>}
            <span className="text-xs text-muted self-center ml-auto">{fmtNum(rosterCount || roster?.length || 0)} shown</span>
          </form>

          <TableShell>
            <thead className="text-xs uppercase text-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Speaker</th>
                <th className="text-left px-4 py-2 font-medium">Company</th>
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">O · C · R</th>
              </tr>
            </thead>
            <tbody>
              {(roster || []).map((c: any) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
                  <td className="px-4 py-2">
                    <Link href={`/influencers/speakers/${c.id}`} className="hover:text-accent">
                      <div className="font-medium">{c.first_name} {c.last_name}</div>
                      {c.email && <div className="text-xs text-muted mono truncate max-w-xs">{c.email}</div>}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {c.companies ? (
                      <Link href={`/companies/${c.companies.id}`} className="text-sm hover:text-accent">{c.companies.name}</Link>
                    ) : <span className="text-muted text-sm">—</span>}
                  </td>
                  <td className="px-4 py-2 text-muted text-sm">{c.job_title || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.lead_status && <Badge tone="muted">{c.lead_status}</Badge>}
                      {(c.key_contact || []).filter((k: string) => k !== "SPEAKER").slice(0, 2).map((k: string) => (
                        <Badge key={k} tone="accent">{k}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right mono text-xs text-muted">
                    {c.emails_opened || 0} · {c.emails_clicked || 0} · {c.emails_replied || 0}
                  </td>
                </tr>
              ))}
              {(!roster || roster.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">No speakers match your search.</td></tr>
              )}
            </tbody>
          </TableShell>
        </div>
      )}

      {tab === "prospects" && (
        <div className="mt-6">
          <div className="text-xs text-muted mb-3">Curated wishlist of speakers we want to land — separate from the Roster (real SPEAKER-tagged contacts).</div>
          <Card padded={false}>
            <div className="grid grid-cols-[2fr_1.4fr_2fr_1.2fr_100px_100px] text-[11px] uppercase tracking-wider text-muted border-b border-subtle px-4 py-2.5 bg-subtle/40 gap-3">
              <div>Speaker</div>
              <div>Company</div>
              <div>Topics</div>
              <div>Target summit</div>
              <div className="text-right">Status</div>
              <div className="text-right">Last touch</div>
            </div>
            {PROSPECTS.map((p) => (
              <div key={p.name} className="grid grid-cols-[2fr_1.4fr_2fr_1.2fr_100px_100px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0 hover:bg-subtle/40">
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted">{p.title}</div>
                </div>
                <div className="text-sm">{p.company}</div>
                <div className="flex flex-wrap gap-1">
                  {p.topics.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
                </div>
                <div className="text-xs">{p.targetSummit}</div>
                <div className="text-right"><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
                <div className="text-right text-xs mono text-muted">{p.lastTouch}</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "summit" && (
        <div className="mt-6">
          {/* Summit selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {SUMMITS.map((s) => (
              <Link
                key={s.slug}
                href={`/influencers/speakers?tab=summit&summit=${s.slug}`}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  summitSlug === s.slug
                    ? "bg-accent text-accentfg border-accent"
                    : "border-border text-muted hover:border-strong hover:text-fg"
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>
          <SummitPanel slug={summitSlug} prospects={PROSPECTS} rosterCount={totalSpeakers || 0} />
        </div>
      )}
    </div>
  );
}

function TabLink({ label, tab, current, count }: { label: string; tab: Tab; current: Tab; count: number }) {
  const active = tab === current;
  return (
    <Link
      href={`/influencers/speakers?tab=${tab}`}
      className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active ? "border-accent text-strong font-medium" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {label} <span className="text-xs text-muted ml-1">({fmtNum(count)})</span>
    </Link>
  );
}

function SummitPanel({ slug, prospects, rosterCount }: { slug: string; prospects: typeof PROSPECTS; rosterCount: number }) {
  const summit = SUMMITS.find((s) => s.slug === slug) || SUMMITS[0];
  const assigned = prospects.filter((p) => summitSlugForName(p.targetSummit) === summit.slug);
  const confirmed = assigned.filter((p) => p.status === "confirmed").length;
  const invited = assigned.filter((p) => p.status === "invited").length;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">{summit.when}</div>
          <div className="tk-editorial text-2xl">{summit.name}</div>
        </div>
        <div className="flex gap-2">
          <Badge tone="success">{confirmed} confirmed</Badge>
          <Badge tone="warn">{invited} invited</Badge>
          <Badge tone="muted">{assigned.length - confirmed - invited} researching</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {summit.tracks.map((t) => (
          <Card key={t}>
            <div className="text-xs uppercase tracking-wider text-muted">Track</div>
            <div className="text-sm font-medium mt-1">{t}</div>
          </Card>
        ))}
      </div>

      <h4 className="text-sm uppercase tracking-wider text-muted mb-3">Speakers assigned to this summit</h4>
      <Card padded={false}>
        {assigned.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">No prospects assigned yet. Assign from the Prospects tab.</div>
        )}
        {assigned.map((p) => (
          <div key={p.name} className="grid grid-cols-[2fr_1.4fr_2fr_100px_100px] gap-3 items-center px-4 py-3 border-b border-subtle last:border-b-0">
            <div>
              <div className="text-sm font-medium">{p.name}</div>
              <div className="text-xs text-muted">{p.title}</div>
            </div>
            <div className="text-sm">{p.company}</div>
            <div className="flex flex-wrap gap-1">
              {p.topics.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
            </div>
            <div className="text-right"><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
            <div className="text-right text-xs mono text-muted">{p.lastTouch}</div>
          </div>
        ))}
      </Card>

      <div className="text-xs text-muted mt-4">
        {rosterCount} SPEAKER-tagged contacts are also available to draw from — assign them to a summit from the Roster tab (coming next).
      </div>
    </div>
  );
}

function summitSlugForName(name: string) {
  return SUMMITS.find((s) => s.name === name)?.slug || "";
}
