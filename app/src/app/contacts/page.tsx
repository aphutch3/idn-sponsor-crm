import { sql } from "@/lib/db";
import { PageHeader, Badge, TableShell } from "@/components/ui";
import Link from "next/link";
import { fmtNum } from "@/lib/utils";

export const revalidate = 30;

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  key_contact: string[] | null;
  lead_status: string | null;
  unsubscribed_all_email: boolean | null;
  emails_opened: number | null;
  emails_clicked: number | null;
  emails_replied: number | null;
  company_id: string | null;
  company_name: string | null;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; key?: string; status?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const PER = 50;
  const offset = (page - 1) * PER;

  const q = (searchParams.q?.trim() || "").replace(/[%,]/g, "") || null;
  const keyTag = searchParams.key?.trim() || null;
  const status = searchParams.status?.trim() || null;

  // Base predicates as a fragment we can reuse for the count query.
  const whereFrag = sql`
    where 1=1
      ${
        q
          ? sql`and (
              first_name ilike ${"%" + q + "%"} or
              last_name  ilike ${"%" + q + "%"} or
              email      ilike ${"%" + q + "%"} or
              job_title  ilike ${"%" + q + "%"}
            )`
          : sql``
      }
      ${keyTag ? sql`and key_contact && ARRAY[${keyTag}]::text[]` : sql``}
      ${status ? sql`and lead_status = ${status}` : sql``}
  `;

  const [rows, totalRow] = await Promise.all([
    sql<ContactRow[]>`
      select id, first_name, last_name, email, job_title, key_contact,
             lead_status, unsubscribed_all_email,
             emails_opened, emails_clicked, emails_replied,
             company_id, company_name
      from public.v_contact
      ${whereFrag}
      order by emails_opened desc nulls last
      limit ${PER} offset ${offset}
    `,
    sql<Array<{ n: number }>>`
      select count(*)::int as n
      from public.v_contact
      ${whereFrag}
    `,
  ]);

  const count = totalRow[0]?.n ?? 0;
  const totalPages = Math.ceil(count / PER);

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
        <select
          name="key"
          defaultValue={searchParams.key || ""}
          className="bg-surface border border-border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All key contacts</option>
          <option value="FRIEND">FRIEND</option>
          <option value="FRIENDLY">FRIENDLY</option>
          <option value="SPEAKER">SPEAKER</option>
          <option value="TARGET">TARGET</option>
          <option value="MOVED">MOVED</option>
        </select>
        <select
          name="status"
          defaultValue={searchParams.status || ""}
          className="bg-surface border border-border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="New">New</option>
        </select>
        <button className="bg-accent text-accentfg px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90">
          Apply
        </button>
        {(searchParams.q || searchParams.key || searchParams.status) && (
          <Link href="/contacts" className="text-sm text-muted hover:text-fg self-center">
            Clear
          </Link>
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
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
              <td className="px-4 py-2">
                <Link href={`/contacts/${c.id}`} className="hover:text-accent">
                  <div className="font-medium">
                    {c.first_name} {c.last_name}
                  </div>
                  {c.email && (
                    <div className="text-xs text-muted mono truncate max-w-xs">{c.email}</div>
                  )}
                </Link>
              </td>
              <td className="px-4 py-2">
                {c.company_id && c.company_name ? (
                  <Link
                    href={`/companies/${c.company_id}`}
                    className="text-sm hover:text-accent"
                  >
                    {c.company_name}
                  </Link>
                ) : (
                  <span className="text-muted text-sm">—</span>
                )}
              </td>
              <td className="px-4 py-2 text-muted text-sm">{c.job_title || "—"}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {(c.key_contact || []).map((k: string) => (
                    <Badge key={k} tone="accent">
                      {k}
                    </Badge>
                  ))}
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

      {count > PER && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-muted">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ pathname: "/contacts", query: { ...searchParams, page: page - 1 } }}
                className="px-3 py-1.5 border border-border rounded-md hover:bg-subtle"
              >
                Prev
              </Link>
            )}
            {offset + PER < count && (
              <Link
                href={{ pathname: "/contacts", query: { ...searchParams, page: page + 1 } }}
                className="px-3 py-1.5 border border-border rounded-md hover:bg-subtle"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
