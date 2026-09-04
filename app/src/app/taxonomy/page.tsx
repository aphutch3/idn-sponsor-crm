import { db } from "@/lib/supabase";
import { PageHeader, Card, Badge } from "@/components/ui";
import Link from "next/link";
import { fmtNum } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export const revalidate = 60;

// Three-column drill-down: Macro → Group → Subcategory
// Each column shows counts. Selected path is reflected in ?macro=&group=&sub=
// This is the featured navigation surface — it's how the CRM is browsed.

export default async function TaxonomyPage({ searchParams }: { searchParams: { macro?: string; group?: string; sub?: string } }) {
  const supa = db();
  const { data: rows } = await supa.from("v_taxonomy").select("*");
  const nodes = (rows || []) as { macro_category: string; group: string | null; subcategory: string | null; company_count: number }[];

  const macros: Record<string, { total: number; groups: Record<string, { total: number; subs: Record<string, number> }> }> = {};
  for (const n of nodes) {
    const m = n.macro_category || "—";
    const g = n.group || "—";
    const s = n.subcategory || "—";
    macros[m] ||= { total: 0, groups: {} };
    macros[m].total += n.company_count;
    macros[m].groups[g] ||= { total: 0, subs: {} };
    macros[m].groups[g].total += n.company_count;
    macros[m].groups[g].subs[s] = (macros[m].groups[g].subs[s] || 0) + n.company_count;
  }

  const macroList = Object.entries(macros).sort((a, b) => b[1].total - a[1].total);
  const selMacro = searchParams.macro && macros[searchParams.macro] ? searchParams.macro : macroList[0]?.[0];
  const groupList = selMacro ? Object.entries(macros[selMacro].groups).sort((a, b) => b[1].total - a[1].total) : [];
  const selGroup = searchParams.group && selMacro && macros[selMacro].groups[searchParams.group] ? searchParams.group : groupList[0]?.[0];
  const subList = selMacro && selGroup ? Object.entries(macros[selMacro].groups[selGroup].subs).sort((a, b) => b[1] - a[1]) : [];
  const selSub = searchParams.sub;

  // Fetch companies filtered by current selection
  let q = supa.from("companies").select("id, name, domain, sponsor_tier, company_type, summit_interest, macro_category, group, subcategory, is_customer, stay_on_top").order("stay_on_top", { ascending: false }).order("sponsor_tier_rank", { ascending: true, nullsFirst: false }).order("name").limit(80);
  if (selMacro) q = q.eq("macro_category", selMacro);
  if (selGroup) q = q.eq("group", selGroup);
  if (selSub) q = q.eq("subcategory", selSub);
  const { data: companies } = await q;

  return (
    <div className="p-8">
      <PageHeader
        title="Taxonomy"
        subtitle="Macro → Group → Subcategory · your primary navigation into the portfolio"
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm mb-4 flex-wrap">
        <Link href="/taxonomy" className="text-muted hover:text-fg">All</Link>
        {selMacro && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted" />
            <Link href={{ pathname: "/taxonomy", query: { macro: selMacro } }} className="hover:text-accent">{selMacro}</Link>
          </>
        )}
        {selMacro && selGroup && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted" />
            <Link href={{ pathname: "/taxonomy", query: { macro: selMacro, group: selGroup } }} className="hover:text-accent">{selGroup}</Link>
          </>
        )}
        {selSub && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted" />
            <span className="text-accent">{selSub}</span>
          </>
        )}
      </nav>

      {/* Three-column browser */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <TaxonomyCol
          label="Macro Category"
          items={macroList.map(([k, v]) => ({ label: k, count: v.total, active: k === selMacro }))}
          hrefBase="/taxonomy"
          param="macro"
        />
        <TaxonomyCol
          label="Group"
          items={groupList.map(([k, v]) => ({ label: k, count: v.total, active: k === selGroup }))}
          hrefBase="/taxonomy"
          param="group"
          carry={{ macro: selMacro }}
        />
        <TaxonomyCol
          label="Subcategory"
          items={subList.map(([k, v]) => ({ label: k, count: v, active: k === selSub }))}
          hrefBase="/taxonomy"
          param="sub"
          carry={{ macro: selMacro, group: selGroup }}
        />
      </div>

      {/* Companies in current slice */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">
          Companies in{" "}
          <span className="text-accent">{selSub || selGroup || selMacro || "portfolio"}</span>
          <span className="text-muted font-normal ml-2">({companies?.length || 0}{(companies?.length || 0) === 80 ? "+" : ""})</span>
        </h2>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Company</th>
              <th className="text-left px-4 py-2 font-medium">Path</th>
              <th className="text-left px-4 py-2 font-medium">Tier</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Summit interest</th>
            </tr>
          </thead>
          <tbody>
            {(companies || []).map((c: any) => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-subtle/50">
                <td className="px-4 py-2">
                  <Link href={`/companies/${c.id}`} className="hover:text-accent">
                    <div className="font-medium">{c.name}</div>
                    {c.domain && <div className="text-xs text-muted mono">{c.domain}</div>}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs text-muted">
                  {c.macro_category} · {c.group || "—"} · {c.subcategory || "—"}
                </td>
                <td className="px-4 py-2">
                  {c.sponsor_tier ? <Badge tone="accent">{c.sponsor_tier}</Badge> : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {c.stay_on_top && <Badge tone="warn">Stay on top</Badge>}
                    {c.is_customer && <Badge tone="success">Customer</Badge>}
                    {c.company_type === "Prospect" && <Badge tone="muted">Prospect</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(c.summit_interest || []).slice(0, 2).map((s: string) => <Badge key={s} tone="default">{s}</Badge>)}
                    {(c.summit_interest || []).length > 2 && <span className="text-xs text-muted">+{c.summit_interest.length - 2}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TaxonomyCol({ label, items, hrefBase, param, carry = {} }: {
  label: string;
  items: { label: string; count: number; active: boolean }[];
  hrefBase: string;
  param: string;
  carry?: Record<string, string | undefined>;
}) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-xs uppercase text-muted font-medium">{label}</div>
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 && <div className="px-3 py-6 text-xs text-muted text-center">Select a parent to browse</div>}
        {items.map(item => {
          const query: Record<string, string> = {};
          for (const [k, v] of Object.entries(carry)) if (v) query[k] = v;
          query[param] = item.label;
          return (
            <Link
              key={item.label}
              href={{ pathname: hrefBase, query }}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-border/40 hover:bg-subtle transition-colors ${item.active ? "bg-accent/10 text-accent" : ""}`}
            >
              <span className="flex-1 truncate">{item.label}</span>
              <div className="w-12 h-1.5 bg-subtle rounded overflow-hidden">
                <div className="h-full bg-accent/60" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <span className="mono text-xs text-muted w-8 text-right">{fmtNum(item.count)}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
