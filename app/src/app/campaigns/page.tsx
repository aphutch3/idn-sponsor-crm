import { admin } from "@/lib/supabase";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";

export const revalidate = 30;

export default async function CampaignsPage() {
  const db = admin();
  const { data: campaigns } = await db.from("campaigns").select("*").order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Campaigns"
        subtitle="Segment-driven Resend campaigns · agent-drafted, human-approved"
        right={<Badge tone="warn">Resend not wired yet</Badge>}
      />
      {(!campaigns || campaigns.length === 0) ? (
        <Empty title="No campaigns yet" hint="Create a segment, then draft a campaign. Resend integration lands in a follow-up." />
      ) : (
        <div className="space-y-2">
          {campaigns.map((c: any) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted">{c.subject}</div>
                </div>
                <Badge tone={c.status === "sending" ? "warn" : c.status === "done" ? "success" : "muted"}>{c.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
