-- 127_company_parent.sql
--
-- public.company could express only two relationships between two names: same
-- company, or unrelated. So a division had nowhere to go. Matching on a shared
-- domain plus overlapping name tokens folded ten legacy speaker companies into
-- another company, and six of those were genuinely the same firm under a
-- different label -- Dataiku/"data iku", AWS/Amazon Web Services,
-- AMD/AMD Advanced Micro Devices, Uber/Uber Technology Inc., Band/Band.ai,
-- Temporal/Temporal Technologies.
--
-- The other four were not: Microsoft Research, Google Cloud, Amazon AGI and
-- QuantumBlack. The speakers app held a separate profile for each, with its own
-- HQ city, headcount band, fit score and positioning, because a sponsorship
-- conversation with Microsoft Research is not one with Microsoft. Folding them
-- in took a real distinction out of the data and left the parent's nine
-- speakers reported under the division's name.
--
-- parent_company_id keeps them separate rows that still roll up, which is the
-- thing neither merging nor duplicating could do.

begin;

alter table public.company
  add column parent_company_id uuid references public.company(id);

comment on column public.company.parent_company_id is
  'Parent when this company is a division, subsidiary or brand of another (Microsoft Research -> Microsoft). NULL for an independent company. An alternative name for the SAME company is not a child -- those are merged.';

-- A company cannot be its own parent. Deeper cycles are not reachable from the
-- loader, which only ever links a child to a company matched by domain.
alter table public.company add constraint company_parent_not_self_ck
  check (parent_company_id is null or parent_company_id <> id);

create index if not exists company_parent_ix
  on public.company (parent_company_id) where parent_company_id is not null;

commit;
