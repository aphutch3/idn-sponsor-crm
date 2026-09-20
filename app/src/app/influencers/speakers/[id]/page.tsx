import Link from "next/link";
import { sql, maybeSingle } from "@/lib/db";
import { PageHeader, Badge, Card, Stat } from "@/components/ui";
import { notFound } from "next/navigation";

export const revalidate = 30;

type SpeakerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  lead_status: string | null;
  emails_opened: number | null;
  emails_clicked: number | null;
  emails_replied: number | null;
  key_contact: string[] | null;
  phone: string | null;
  linkedin_url: string | null;
  company_id: string | null;
  company_name: string | null;
  company_industry: string | null;
  company_website_url: string | null;
};

export default async function SpeakerDetailPage({ params }: { params: { id: string } }) {
  const rows = await sql<SpeakerRow[]>`
    select
      c.id, c.first_name, c.last_name, c.email, c.job_title, c.lead_status,
      c.emails_opened, c.emails_clicked, c.emails_replied, c.key_contact,
      c.phone, c.linkedin_url, c.company_id,
      co.name        as company_name,
      co.industry    as company_industry,
      co.website_url as company_website_url
    from public.contact c
    left join public.company co on co.id = c.company_id
    where c.id = ${params.id}
    limit 1
  `;
  const c = maybeSingle<SpeakerRow>(rows);

  if (!c) return notFound();
  if (!(c.key_contact || []).includes("SPEAKER")) return notFound();

  const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Speaker";
  const company = c.company_id
    ? { id: c.company_id, name: c.company_name ?? "", industry: c.company_industry, website_url: c.company_website_url }
    : null;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 text-xs text-muted mb-3">
        <Link href="/influencers" className="hover:text-strong">Influencers</Link>
        <span>/</span>
        <Link href="/influencers/speakers" className="hover:text-strong">Event Speakers</Link>
        <span>/</span>
        <span className="text-strong">{name}</span>
      </div>

      <PageHeader
        eyebrow={company ? company.name : "Speaker"}
        title={name}
        subtitle={c.job_title || undefined}
        right={
          <div className="flex gap-2">
            {c.lead_status && <Badge tone="muted">{c.lead_status}</Badge>}
            {(c.key_contact || []).map((k: string) => <Badge key={k} tone={k === "SPEAKER" ? "accent" : "muted"}>{k}</Badge>)}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4 mt-6">
        <Stat label="Emails opened" value={c.emails_opened || 0} sub="lifetime" />
        <Stat label="Clicks" value={c.emails_clicked || 0} sub="lifetime" />
        <Stat label="Replies" value={c.emails_replied || 0} sub="lifetime" accent />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-8">
        {/* Contact info */}
        <Card>
          <h4 className="text-xs uppercase tracking-wider text-muted mb-3">Contact</h4>
          <dl className="text-sm space-y-2">
            {c.email && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd className="mono text-xs truncate max-w-xs">
                  <a href={`mailto:${c.email}`} className="hover:text-accent">{c.email}</a>
                </dd>
              </div>
            )}
            {c.phone && (
              <div className="flex justify-between gap-3"><dt className="text-muted">Phone</dt><dd className="mono text-xs">{c.phone}</dd></div>
            )}
            {c.linkedin_url && (
              <div className="flex justify-between gap-3"><dt className="text-muted">LinkedIn</dt><dd><a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-xs hover:text-accent">Profile ↗</a></dd></div>
            )}
            {!c.email && !c.phone && !c.linkedin_url && (
              <div className="text-xs text-muted">No contact details on file.</div>
            )}
          </dl>
        </Card>

        {/* Company */}
        <Card>
          <h4 className="text-xs uppercase tracking-wider text-muted mb-3">Company</h4>
          {company ? (
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Name</dt>
                <dd><Link href={`/companies/${company.id}`} className="hover:text-accent font-medium">{company.name}</Link></dd>
              </div>
              {company.industry && (
                <div className="flex justify-between gap-3"><dt className="text-muted">Industry</dt><dd>{company.industry}</dd></div>
              )}
              {company.website_url && (
                <div className="flex justify-between gap-3"><dt className="text-muted">Website</dt><dd><a href={company.website_url.startsWith("http") ? company.website_url : `https://${company.website_url}`} target="_blank" rel="noreferrer" className="text-xs hover:text-accent">Visit ↗</a></dd></div>
              )}
            </dl>
          ) : (
            <div className="text-xs text-muted">No company associated.</div>
          )}
        </Card>
      </div>

      {/* Session history placeholder */}
      <div className="mt-8">
        <h4 className="text-sm uppercase tracking-wider text-muted mb-3">Session history</h4>
        <Card>
          <div className="text-sm text-muted">
            <p>No session history captured yet. Once a Sessions table lands in the canonical schema, this panel will list every session this speaker delivered — with summit, sponsor associations, and downstream engagement.</p>
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mt-8">
        <Link href="/influencers/speakers" className="text-sm text-muted hover:text-fg">← Back to roster</Link>
        {c.email && (
          <a href={`mailto:${c.email}`} className="ml-auto bg-accent text-accentfg px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90">Email speaker</a>
        )}
        {company && (
          <Link href={`/companies/${company.id}`} className="border border-border text-sm px-3 py-1.5 rounded-md hover:bg-subtle">View company</Link>
        )}
      </div>
    </div>
  );
}
