import { sql } from "@/lib/db";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const revalidate = 15;

const AGENT_KINDS = [
  { kind: "enrich_company", label: "Company enrichment", desc: "Perplexity + web research on a company · updates macro_category, subcategory, keywords" },
  { kind: "next_actions",   label: "Next actions",       desc: "Given a company + engagement, suggest 3 concrete next moves" },
  { kind: "draft_email",    label: "Draft outreach email", desc: "Personalized cold or nurture email based on company + contact context" },
  { kind: "build_segment",  label: "Build segment from prose", desc: "Turns a natural-language brief into a SQL segment definition" },
  { kind: "score_prospects", label: "Score prospects",   desc: "Ranks a segment by likelihood of sponsoring the next summit" },
];

type RunRow = {
  id: string;
  agent_name: string;
  status: string;
  entity_table: string | null;
  entity_id: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export default async function AgentsPage() {
  const runs = await sql<RunRow[]>`
    select id, agent_name, status, entity_table, entity_id, started_at, completed_at
      from public.agent_run
     order by started_at desc nulls last
     limit 20
  `;

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Agents"
        subtitle="Autonomous workers. Every run is logged."
        right={<Badge tone="warn">Wiring in progress</Badge>}
      />

      <h2 className="text-sm font-medium mb-2">Available agents</h2>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {AGENT_KINDS.map((a) => (
          <Card key={a.kind} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">{a.label}</div>
              <Badge tone="muted" className="mono">{a.kind}</Badge>
            </div>
            <div className="text-xs text-muted">{a.desc}</div>
          </Card>
        ))}
      </div>

      <h2 className="text-sm font-medium mb-2">Recent runs</h2>
      {runs.length === 0 ? (
        <Empty title="No agent runs yet" hint="Agent invocations will appear here with input, output, and status." />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <Card key={r.id} className="p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={r.status === "error" ? "danger" : r.status === "done" ? "success" : "warn"}>{r.status}</Badge>
                <span className="mono text-xs">{r.agent_name}</span>
                <span className="text-xs text-muted">→ {r.entity_table ?? ""} {r.entity_id?.slice(0, 8) || ""}</span>
                <span className="ml-auto text-xs text-muted">{fmtDate(r.started_at ?? "")}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
