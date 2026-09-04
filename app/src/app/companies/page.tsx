import { admin } from "@/lib/supabase";
import { PageHeader, Badge, TableShell, Card } from "@/components/ui";
import Link from "next/link";
import { fmtNum } from "@/lib/utils";

export const revalidate = 30;

export default async function CompaniesPage({ searchParams }: { searchParams: { q?: string; tier?: string; macro?: string; page?: string } }) {
  const db = admin();
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const PER = 50;
  const from = (page - 1) * PER;
  const to = from + PER - 1;

  let query = db.from("companies").select(
    "id, name, domain, sponsor_tier, sponsor_tier_rank, macro_category, subcategory, country_region, company_type, summit_interest",
    { count: "exact" }
  );

  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);
  if (searchParams.tier) query = query.eq("sponsor_tier", searchParams.tier);
  if (searchParams.macro) query = query.eq("macro_category", searchParams.macro);

  const { data: rows, count } = await query
    .order("sponsor_tier_rank", { ascending: true, nullsFirst: false })
    .order("name")
    .range(from, to);

  // filter options
  const { data: tiers } = await db.from("companies").select("sponsor_tier").not("sponsor_tier","is",null);
  const uniqTiers = Array.from(new Set((tiers || []).map((r: any) => r.sponsor_tier))).sort();
  const { data: macros } = await db.from("companies").select("macro_category").not("macro_category","is",null);
  const macroCount: Record<string, number> = {};
  (macros || []).forEach((r: any) => macroCount[r.macro_category] = (macroCount[r.macro_category] || 0) + 1);

  return (
    <div className="p-8">
      <PageHeader
        title="Companies"
        subtitle={`${fmtNum(count)} total`}
      />

      <form className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q || ""}
          placeholder="Search company name…"
          className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select name="tier" defaultValue={searchParams.tier || ""} className="bg-surface border border-border rounded-md px-2 py-1.5 text-sm">
          <option value="">All tiers</option>
          {uniqTiers.map((t: any) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="macro" defaultValue={searchParams.macro || ""} className="bg-surface border border-border rounded-md px-2 py-1.5 text-sm">
          <option value="">All categories</option>
          {Object.entries(macroCount).sort((a,b)=>b[1]-a[1]).map(([m,n]) => (
            <option key={m} value={m}>{m} ({n})</option>
          ))}
        </select>
        <button className="bg-accent text-accentfg px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90">Apply</button>
        {(searchParams.q || searchParams.tier || searchParams.macro) && (
          <Link href="/companies" className="text-sm text-muted hover:text-fg self-center">Clear</Link>
        )}
      </form>

      <TableShell>
        <thead className="text-xs uppercase text-muted border-b border-border">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Company</th>
            <th className="text-left px-4 py-2 font-medium">Tier</th>
            <th className="text-left px-4 py-2 font-medium">Type</th>
            <th className="text-left px-4 py-2 font-medium">Category</th>
            <th className="text-left px-4 py-2 font-medium">Summit interest</th>
            <th className="text-left px-4 py-2 font-medium">Country</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((c: any) => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
              <td className="px-4 py-2">
                <Link href={`/companies/${c.id}`} className="hover:text-accent">
                  <div className="font-medium">{c.name}</div>
                  {c.domain && <div className="text-xs text-muted mono">{c.domain}</div>}
                </Link>
              </td>
              <td className="px-4 py-2">{c.sponsor_tier ? <Badge tone="accent">{c.sponsor_tier}</Badge> : <span className="text-muted">—</span>}</td>
              <td className="px-4 py-2">{c.company_type ? <Badge tone="muted">{c.company_type}</Badge> : <span className="text-muted">—</span>}</td>
              <td className="px-4 py-2 text-muted">{c.macro_category || "—"}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {(c.summit_interest || []).slice(0, 2).map((s: string) => <Badge key={s} tone="default">{s}</Badge>)}
                  {(c.summit_interest || []).length > 2 && <span className="text-xs text-muted">+{c.summit_interest.length - 2}</span>}
                </div>
              </td>
              <td className="px-4 py-2 text-muted text-xs">{c.country_region || "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      {(count || 0) > PER && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-muted">Page {page} of {Math.ceil((count || 0) / PER)}</div>
          <div className="flex gap-2">
            {page > 1 && <Link href={{ pathname: "/companies", query: { ...searchParams, page: page - 1 } }} className="px-3 py-1.5 border border-border rounded-md hover:bg-subtle">Prev</Link>}
            {from + PER < (count || 0) && <Link href={{ pathname: "/companies", query: { ...searchParams, page: page + 1 } }} className="px-3 py-1.5 border border-border rounded-md hover:bg-subtle">Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
