import { admin } from "@/lib/supabase";
import { PageHeader, Badge, TableShell } from "@/components/ui";
import Link from "next/link";
import { fmtNum } from "@/lib/utils";

export const revalidate = 30;

export default async function ContactsPage({ searchParams }: { searchParams: { q?: string; key?: string; status?: string; page?: string } }) {
  const db = admin();
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const PER = 50;
  const from = (page - 1) * PER;
  const to = from + PER - 1;

  let query = db.from("contacts").select(
    "id, first_name, last_name, email, job_title, key_contact, lead_status, unsubscribed_all_email, emails_opened, emails_clicked, emails_replied, company_id, companies(id, name)",
    { count: "exact" }
  );

  if (searchParams.q) {
    const q = searchParams.q.replace(/[%,]/g,"");
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,job_title.ilike.%${q}%`);
  }
  if (searchParams.key) query = query.contains("key_contact", [searchParams.key]);
  if (searchParams.status) query = query.eq("lead_status", searchParams.status);

  const { data: rows, count } = await query
    .order("emails_opened", { ascending: false, nullsFirst: false })
    .range(from, to);

  return (
    <div className="p-8">
      <PageHeader title="Contacts" subtitle={`${fmtNum(count)} total`} />

      <form className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q || ""}
          placeholder="Search name, email, title…"
          className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select name="key" defaultValue={searchParams.key || ""} className="bg-surface border border-border rounded-md px-2 py-1.5 text-sm">
          <option value="">All key contacts</option>
          <option value="FRIEND">FRIEND</option>
          <option value="FRIENDLY">FRIENDLY</option>
          <option value="SPEAKER">SPEAKER</option>
          <option value="TARGET">TARGET</option>
          <option value="MOVED">MOVED</option>
        </select>
        <select name="status" defaultValue={searchParams.status || ""} className="bg-surface border border-border rounded-md px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="New">New</option>
        </select>
        <button className="bg-accent text-accentfg px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90">Apply</button>
        {(searchParams.q || searchParams.key || searchParams.status) && (
          <Link href="/contacts" className="text-sm text-muted hover:text-fg self-center">Clear</Link>
        )}
      </form>

      <TableShell>
        <thead className="text-xs uppercase text-muted border-b border-border">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Contact</th>
            <th className="text-left px-4 py-2 font-medium">Company</th>
            <th className="text-left px-4 py-2 font-medium">Title</th>
            <th className="text-left px-4 py-2 font-medium">Signals</th>
            <th className="text-right px-4 py-2 font-medium">O · C · R</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((c: any) => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
              <td className="px-4 py-2">
                <Link href={`/contacts/${c.id}`} className="hover:text-accent">
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
                  {(c.key_contact || []).map((k: string) => <Badge key={k} tone="accent">{k}</Badge>)}
                  {c.lead_status && <Badge tone="muted">{c.lead_status}</Badge>}
                  {c.unsubscribed_all_email && <Badge tone="danger">Unsub</Badge>}
                </div>
              </td>
              <td className="px-4 py-2 text-right mono text-xs text-muted">
                {c.emails_opened || 0} · {c.emails_clicked || 0} · {c.emails_replied || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      {(count || 0) > PER && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-muted">Page {page} of {Math.ceil((count || 0) / PER)}</div>
          <div className="flex gap-2">
            {page > 1 && <Link href={{ pathname: "/contacts", query: { ...searchParams, page: page - 1 } }} className="px-3 py-1.5 border border-border rounded-md hover:bg-subtle">Prev</Link>}
            {from + PER < (count || 0) && <Link href={{ pathname: "/contacts", query: { ...searchParams, page: page + 1 } }} className="px-3 py-1.5 border border-border rounded-md hover:bg-subtle">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
