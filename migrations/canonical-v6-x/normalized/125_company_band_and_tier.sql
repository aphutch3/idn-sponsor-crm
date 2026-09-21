-- 125_company_band_and_tier.sql
--
-- Two defects in public.company, both found by making merge conflicts readable
-- (124). Each is a column whose name and contents disagree, which is precisely
-- what a canonical model exists to prevent -- an agent reading this schema
-- cannot be asked to guess which of two vocabularies a value belongs to.
--
-- (1) employee_count_band holds a raw headcount for 2,025 of 2,193 non-null
--     rows -- "30.0", "3000.0" -- against 168 rows that hold an actual band.
--     number_of_employees already holds the integer for all 2,025 and agrees
--     exactly in every case, so the text was a duplicate of a column next to
--     it, stored in the wrong type, in a column named for a different concept.
--     The speakers app supplies genuine bands, so the merge compared "30.0"
--     against "11-50" 243 times and recorded a conflict where there was none.
--
-- (2) sponsor_tier holds two unrelated vocabularies. Diamond / Platinum / Gold
--     / Titanium / Strategic Partners / Apex Partner are sponsorship levels
--     sold by the events business. 0_Gorilla / 1_Top Tier / 4_Attention /
--     5_Resurrection / 90_Purchased are Engager and HubSpot account-priority
--     ratings -- how much attention sales should give an account, which is not
--     a thing anyone bought. Ordering, filtering or counting sponsors by this
--     column silently mixes the two.

begin;

-- ---------------------------------------------------------------- (1) band
-- Bands are widened, never narrowed: 2-10 is contained by 1-10 and 101-200 by
-- 51-200, so the coarser band stays true. Exact figures are not lost -- they
-- are in number_of_employees, which is where an exact figure belongs.
update public.company set employee_count_band = case
    when employee_count_band in ('2-10')                  then '1-10'
    when employee_count_band in ('101-200')               then '51-200'
    when employee_count_band in ('2001-5000')             then '1001-5000'
    when employee_count_band in ('10000+', '100001+')     then '10001+'
    else employee_count_band end
where employee_count_band in
  ('2-10','101-200','2001-5000','10000+','100001+');

-- Backfill the integer first for any raw-number row that somehow lacks it, so
-- replacing the text below cannot lose a figure. Expected to touch 0 rows.
update public.company
   set number_of_employees = employee_count_band::numeric::int
 where number_of_employees is null
   and employee_count_band ~ '^[0-9]+(\.[0-9]+)?$';

-- Replace each raw number with the band it falls in.
update public.company set employee_count_band = case
    when number_of_employees <=    10 then '1-10'
    when number_of_employees <=    50 then '11-50'
    when number_of_employees <=   200 then '51-200'
    when number_of_employees <=   500 then '201-500'
    when number_of_employees <=  1000 then '501-1000'
    when number_of_employees <=  5000 then '1001-5000'
    when number_of_employees <= 10000 then '5001-10000'
    else '10001+' end
where employee_count_band ~ '^[0-9]+(\.[0-9]+)?$';

alter table public.company add constraint company_employee_band_ck
  check (employee_count_band is null or employee_count_band in
    ('1-10','11-50','51-200','201-500','501-1000',
     '1001-5000','5001-10000','10001+'));

comment on column public.company.employee_count_band is
  'Coarse size band from a fixed vocabulary. An exact headcount belongs in number_of_employees; this column must never hold one.';

-- --------------------------------------------------------------- (2) tier
alter table public.company add column account_priority text;

comment on column public.company.account_priority is
  'Sales attention rating from the CRM (Engager/HubSpot). Not a sponsorship level and not customer-visible.';
comment on column public.company.sponsor_tier is
  'Sponsorship level actually sold by the events business. CRM account ratings live in account_priority.';

update public.company
   set account_priority = sponsor_tier,
       sponsor_tier     = null
 where sponsor_tier ~ '^[0-9]+_';

alter table public.company add constraint company_sponsor_tier_ck
  check (sponsor_tier is null or sponsor_tier !~ '^[0-9]+_');

create index if not exists company_account_priority_ix
  on public.company (account_priority) where account_priority is not null;

commit;
