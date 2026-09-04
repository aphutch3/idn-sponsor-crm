import { admin } from "@/lib/supabase";
import { CompaniesShell } from "./companies-shell";

export const revalidate = 30;

export default async function CompaniesPage({ searchParams }: { searchParams: { q?: string; tier?: string; macro?: string; page?: string } }) {
  const db = admin();
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const PER = 50;
  const from = (page - 1) * PER;
  const to = from + PER - 1;

  let query = db.from("companies").select(
    "id, name, domain, sponsor_tier, sponsor_tier_rank, macro_category, subcategory, country_region, company_type, summit_interest, is_customer, stay_on_top, headquarters, employee_count, primary_hq_country",
    { count: "exact" }
  );

  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);
  if (searchParams.tier) query = query.eq("sponsor_tier", searchParams.tier);
  if (searchParams.macro) query = query.eq("macro_category", searchParams.macro);

  const { data: rows, count } = await query
    .order("sponsor_tier_rank", { ascending: true, nullsFirst: false })
    .order("name")
    .range(from, to);

  const [{ data: tierRows }, { data: macroRows }] = await Promise.all([
    db.from("companies").select("sponsor_tier").not("sponsor_tier", "is", null),
    db.from("companies").select("macro_category").not("macro_category", "is", null),
  ]);
  const tierCounts: Record<string, number> = {};
  (tierRows || []).forEach((r: any) => tierCounts[r.sponsor_tier] = (tierCounts[r.sponsor_tier] || 0) + 1);
  const tiers = Object.entries(tierCounts).map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
  const macroCounts: Record<string, number> = {};
  (macroRows || []).forEach((r: any) => macroCounts[r.macro_category] = (macroCounts[r.macro_category] || 0) + 1);
  const macros = Object.entries(macroCounts).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

  return (
    <CompaniesShell
      rows={(rows as any) || []}
      count={count || 0}
      page={page}
      perPage={PER}
      tiers={tiers}
      macros={macros}
      query={searchParams}
    />
  );
}
