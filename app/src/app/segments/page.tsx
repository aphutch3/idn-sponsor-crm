import { admin } from "@/lib/supabase";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";
import Link from "next/link";

export const revalidate = 30;

export default async function SegmentsPage() {
  const db = admin();
  const { data: segments } = await db.from("segments").select("*").order("created_at", { ascending: false });

  // Suggested built-in segments (based on the data we have)
  const suggestions = [
    { name: "Tiered sponsors (Top + 2nd + Gorilla)", entity: "company", desc: "sponsor_tier_rank <= 2" },
    { name: "Resurrection candidates", entity: "company", desc: "sponsor_tier = 5_Resurrection" },
    { name: "AI Deployment summit interest", entity: "company", desc: "'AI Deployment' = ANY(summit_interest)" },
    { name: "Speakers", entity: "contact", desc: "'SPEAKER' = ANY(key_contact)" },
    { name: "Friends", entity: "contact", desc: "'FRIEND' = ANY(key_contact)" },
    { name: "Engaged, not unsubscribed", entity: "contact", desc: "emails_opened > 0 AND NOT unsubscribed_all_email" },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Segments" subtitle="Saved filters that campaigns and agents can target" />

      <h2 className="text-sm font-medium mb-2">Saved</h2>
      {(!segments || segments.length === 0) ? (
        <Empty title="No saved segments yet" hint="Segment authoring UI is next up — for now, agents can create them via SQL." />
      ) : (
        <div className="space-y-2 mb-6">
          {segments.map((s: any) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted">{s.description}</div>
                </div>
                <Badge tone="muted">{s.entity}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-sm font-medium mb-2 mt-6">Suggested</h2>
      <div className="grid grid-cols-2 gap-2">
        {suggestions.map(s => (
          <Card key={s.name} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">{s.name}</div>
              <Badge tone="muted">{s.entity}</Badge>
            </div>
            <div className="text-xs text-muted mono">{s.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
