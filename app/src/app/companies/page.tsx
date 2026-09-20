import { sql } from "@/lib/db";
import { CompaniesShell } from "./companies-shell";

export const revalidate = 30;

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; tier?: string; macro?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const PER = 50;
  const offset = (page - 1) * PER;

  const q = searchParams.q?.trim() || null;
  const tier = searchParams.tier?.trim() || null;
  const macro = searchParams.macro?.trim() || null;

  const [rows, totalRow, tierRows, macroRows] = await Promise.all([
    sql<
      Array<{
        id: string;
        name: string;
        domain: string | null;
        sponsor_tier: string | null;
        sponsor_tier_rank: number | null;
        macro_category: string | null;
        subcategory: string | null;
        country_region: string | null;
        company_type: string | null;
        summit_interest: string[] | null;
        is_customer: boolean;
        stay_on_top: boolean;
        industry: string | null;
        number_of_employees: number | null;
        linkedin_url: string | null;
      }>
    >`
      select id, name, domain, sponsor_tier, sponsor_tier_rank, macro_category,
             subcategory, country_region, company_type, summit_interest,
             is_customer, stay_on_top, industry, number_of_employees, linkedin_url
      from public.company
      where 1=1
        ${q ? sql`and name ilike ${"%" + q + "%"}` : sql``}
        ${tier ? sql`and sponsor_tier = ${tier}` : sql``}
        ${macro ? sql`and macro_category = ${macro}` : sql``}
      order by sponsor_tier_rank asc nulls last, name asc
      limit ${PER} offset ${offset}
    `,
    sql<Array<{ n: number }>>`
      select count(*)::int as n
      from public.company
      where 1=1
        ${q ? sql`and name ilike ${"%" + q + "%"}` : sql``}
        ${tier ? sql`and sponsor_tier = ${tier}` : sql``}
        ${macro ? sql`and macro_category = ${macro}` : sql``}
    `,
    sql<Array<{ sponsor_tier: string; n: number }>>`
      select sponsor_tier, count(*)::int as n
      from public.company
      where sponsor_tier is not null
      group by sponsor_tier
      order by sponsor_tier
    `,
    sql<Array<{ macro_category: string; n: number }>>`
      select macro_category, count(*)::int as n
      from public.company
      where macro_category is not null
      group by macro_category
      order by n desc
    `,
  ]);

  const count = totalRow[0]?.n ?? 0;
  const tiers = tierRows.map((r) => ({ value: r.sponsor_tier, count: r.n }));
  const macros = macroRows.map((r) => ({ value: r.macro_category, count: r.n }));

  return (
    <CompaniesShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows={rows as any}
      count={count}
      page={page}
      perPage={PER}
      tiers={tiers}
      macros={macros}
      query={searchParams}
    />
  );
}
