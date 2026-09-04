"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThreePane } from "@/components/three-pane";
import { Badge } from "@/components/ui";

type Row = {
  id: string;
  name: string | null;
  domain: string | null;
  sponsor_tier: string | null;
  sponsor_tier_rank: number | null;
  macro_category: string | null;
  subcategory: string | null;
  country_region: string | null;
  company_type: string | null;
  summit_interest: string[] | null;
  is_customer?: boolean | null;
  stay_on_top?: boolean | null;
  linkedin_bio?: string | null;
  headquarters?: string | null;
  employee_count?: string | number | null;
  primary_hq_country?: string | null;
};

type Props = {
  rows: Row[];
  count: number;
  page: number;
  perPage: number;
  tiers: { value: string; count: number }[];
  macros: { value: string; count: number }[];
  query: Record<string, string | undefined>;
};

export function CompaniesShell({ rows, count, page, perPage, tiers, macros, query }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = React.useState<string | null>(rows[0]?.id ?? null);

  const selected = React.useMemo(
    () => rows.find(r => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/companies?${next.toString()}`);
  };

  const activeTier = query.tier || "";
  const activeMacro = query.macro || "";

  return (
    <ThreePane
      storageKey="crm-companies"
      crumbs={
        <>
          <Link href="/">Home</Link>
          <span>/</span>
          <span style={{ color: "var(--tk-text)" }}>Companies</span>
          {activeTier && <><span>/</span><span>{activeTier}</span></>}
          {activeMacro && <><span>/</span><span>{activeMacro}</span></>}
        </>
      }
      leftCollapsedLabel="Navigation"
      rightCollapsedLabel="Properties"
      left={
        <div>
          <div style={{ padding: "18px 20px 8px" }}>
            <div className="tk-eyebrow">Navigation</div>
            <div className="tk-editorial" style={{ fontSize: 20, marginTop: 6 }}>Companies</div>
            <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 4 }}>{count.toLocaleString()} total</div>
          </div>
          <div className="tk-curriculum-section">
            <h3>Sponsor tiers</h3>
            <button className={`tk-curriculum-lesson ${!activeTier ? "active" : ""}`} onClick={() => setFilter("tier", null)} style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}>
              <span className="tk-check" />
              <span style={{ flex: 1 }}>All tiers</span>
              <span style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{count.toLocaleString()}</span>
            </button>
            {tiers.map(t => (
              <button
                key={t.value}
                className={`tk-curriculum-lesson ${activeTier === t.value ? "active" : ""}`}
                onClick={() => setFilter("tier", activeTier === t.value ? null : t.value)}
                style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}
              >
                <span className="tk-check" />
                <span style={{ flex: 1 }}>{t.value}</span>
                <span style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="tk-curriculum-section">
            <h3>Macro category</h3>
            <button className={`tk-curriculum-lesson ${!activeMacro ? "active" : ""}`} onClick={() => setFilter("macro", null)} style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}>
              <span className="tk-check" />
              <span style={{ flex: 1 }}>All categories</span>
            </button>
            {macros.map(m => (
              <button
                key={m.value}
                className={`tk-curriculum-lesson ${activeMacro === m.value ? "active" : ""}`}
                onClick={() => setFilter("macro", activeMacro === m.value ? null : m.value)}
                style={{ width: "100%", background: "none", border: 0, textAlign: "left" }}
              >
                <span className="tk-check" />
                <span style={{ flex: 1 }}>{m.value}</span>
                <span style={{ fontSize: 11, color: "var(--tk-text-muted)" }}>{m.count}</span>
              </button>
            ))}
          </div>
        </div>
      }
      right={
        selected ? (
          <PropertiesPanel company={selected} />
        ) : (
          <div style={{ padding: 20, color: "var(--tk-text-muted)", fontSize: 13 }}>
            Select a company to see its properties.
          </div>
        )
      }
    >
      {/* Center: filter chips + table */}
      <div className="flex items-center justify-between mb-4">
        <div className="tk-eyebrow">
          {count.toLocaleString()} companies · page {page} of {Math.max(1, Math.ceil(count / perPage))}
        </div>
        <form className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query.q || ""}
            placeholder="Search company name…"
            className="tk-input"
            style={{ width: 220 }}
          />
          {activeTier && <input type="hidden" name="tier" value={activeTier} />}
          {activeMacro && <input type="hidden" name="macro" value={activeMacro} />}
          <button className="tk-btn tk-btn-sm tk-btn-primary" type="submit">Search</button>
          {(query.q || query.tier || query.macro) && (
            <Link href="/companies" className="tk-btn tk-btn-sm tk-btn-ghost">Clear</Link>
          )}
        </form>
      </div>

      <div className="tk-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tk-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Tier</th>
                <th>Type</th>
                <th>Category</th>
                <th>Summit interest</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{ cursor: "pointer", background: selectedId === c.id ? "#f3f4f6" : undefined }}
                >
                  <td>
                    <Link href={`/companies/${c.id}`} className="hover:underline" style={{ color: "var(--tk-text)" }}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      {c.domain && <div style={{ fontSize: 12, color: "var(--tk-text-muted)", fontFamily: "monospace" }}>{c.domain}</div>}
                    </Link>
                  </td>
                  <td>{c.sponsor_tier ? <Badge tone="accent">{c.sponsor_tier}</Badge> : <span style={{ color: "var(--tk-text-muted)" }}>—</span>}</td>
                  <td>{c.company_type ? <Badge tone="muted">{c.company_type}</Badge> : <span style={{ color: "var(--tk-text-muted)" }}>—</span>}</td>
                  <td style={{ color: "var(--tk-text-secondary)" }}>{c.macro_category || "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(c.summit_interest || []).slice(0, 2).map(s => <Badge key={s}>{s}</Badge>)}
                      {(c.summit_interest || []).length > 2 && <span style={{ fontSize: 12, color: "var(--tk-text-muted)" }}>+{(c.summit_interest || []).length - 2}</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--tk-text-muted)" }}>{c.country_region || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {count > perPage && (
        <div className="flex items-center justify-between mt-4">
          <div style={{ fontSize: 13, color: "var(--tk-text-muted)" }}>
            Page {page} of {Math.ceil(count / perPage)}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className="tk-btn tk-btn-sm tk-btn-ghost"
                href={`/companies?${new URLSearchParams({ ...(query as any), page: String(page - 1) }).toString()}`}
              >
                Prev
              </Link>
            )}
            {page * perPage < count && (
              <Link
                className="tk-btn tk-btn-sm tk-btn-ghost"
                href={`/companies?${new URLSearchParams({ ...(query as any), page: String(page + 1) }).toString()}`}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </ThreePane>
  );
}

function PropertiesPanel({ company }: { company: Row }) {
  return (
    <div style={{ padding: 20 }}>
      <div className="tk-eyebrow" style={{ marginBottom: 8 }}>Properties</div>
      <div className="tk-editorial" style={{ fontSize: 22, lineHeight: 1.15 }}>{company.name}</div>
      {company.domain && (
        <a
          href={`https://${company.domain}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: "monospace", fontSize: 12, color: "var(--tk-teal)", display: "block", marginTop: 4 }}
        >
          {company.domain}
        </a>
      )}
      <div className="flex flex-wrap gap-1" style={{ marginTop: 12 }}>
        {company.is_customer && <Badge tone="success">Customer</Badge>}
        {company.stay_on_top && <Badge tone="accent">Stay on top</Badge>}
        {company.sponsor_tier && <Badge tone="teal">{company.sponsor_tier}</Badge>}
      </div>

      <dl style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <Field label="Company type" value={company.company_type} />
        <Field label="Macro category" value={company.macro_category} />
        <Field label="Subcategory" value={company.subcategory} />
        <Field label="Country" value={company.country_region || company.primary_hq_country} />
        <Field label="Headquarters" value={company.headquarters} />
        <Field label="Employees" value={company.employee_count as any} />
        <Field label="Summit interest" value={(company.summit_interest || []).join(", ")} />
      </dl>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <Link className="tk-btn tk-btn-sm tk-btn-primary" href={`/companies/${company.id}`}>Open full record</Link>
        <Link className="tk-btn tk-btn-sm tk-btn-ghost" href={`/companies/${company.id}#agent`}>Run research agent</Link>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <dt style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--tk-text-muted)", fontWeight: 600 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, color: "var(--tk-text)", marginTop: 2 }}>{value ? String(value) : <span style={{ color: "var(--tk-text-muted)" }}>—</span>}</dd>
    </div>
  );
}
