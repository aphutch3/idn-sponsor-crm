import Link from "next/link";
import { admin } from "@/lib/supabase";
import { PageHeader, Badge, Card, Stat } from "@/components/ui";
import { notFound } from "next/navigation";

export const revalidate = 30;

export default async function SpeakerDetailPage({ params }: { params: { id: string } }) {
  const db = admin();
  const { data: c } = await db.from("contacts")
    .select("id, first_name, last_name, email, job_title, lead_status, emails_opened, emails_clicked, emails_replied, key_contact, phone, linkedin_url, twitter_url, notes, company_id, companies(id, name, industry, website)")
    .eq("id", params.id)
    .maybeSingle();

  if (!c) return notFound();
  if (!(c.key_contact || []).includes("SPEAKER")) return notFound();

  const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Speaker";
  const company: any = c.companies;

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
            {c.twitter_url && (
              <div className="flex justify-between gap-3"><dt className="text-muted">X / Twitter</dt><dd><a href={c.twitter_url} target="_blank" rel="noreferrer" className="text-xs hover:text-accent">Profile ↗</a></dd></div>
            )}
            {!c.email && !c.phone && !c.linkedin_url && !c.twitter_url && (
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
              {company.website && (
                <div className="flex justify-between gap-3"><dt className="text-muted">Website</dt><dd><a href={company.website} target="_blank" rel="noreferrer" className="text-xs hover:text-accent">{new URL(company.website.startsWith("http") ? company.website : `https://${company.website}`).hostname} ↗</a></dd></div>
              )}
            </dl>
          ) : (
            <div className="text-xs text-muted">No company associated.</div>
          )}
        </Card>
      </div>

      {/* Session history / notes placeholder */}
      <div className="mt-8">
        <h4 className="text-sm uppercase tracking-wider text-muted mb-3">Session history & notes</h4>
        <Card>
          {c.notes ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.notes}</p>
          ) : (
            <div className="text-sm text-muted">
              <p>No session history captured yet. Once a Sessions table lands in Supabase, this panel will list every session this speaker delivered — with summit, sponsor associations, and downstream engagement.</p>
            </div>
          )}
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
