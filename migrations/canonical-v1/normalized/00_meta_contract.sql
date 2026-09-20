-- IDN Canonical Schema Contract v1
-- Release candidate canonical-v1. Execute only through the guarded release runner.
-- Purpose: queryable semantic annotations and app access declarations.

begin;

create schema if not exists meta;

create table if not exists meta.schema_release (
  version text primary key,
  state text not null check (state in ('draft', 'approved', 'deployed', 'retired')),
  approved_at timestamptz,
  deployed_at timestamptz,
  git_repository text,
  git_commit text,
  neon_branch_id text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists meta.object_annotation (
  schema_name text not null,
  object_name text not null,
  object_kind text not null check (object_kind in ('table', 'view', 'materialized_view', 'function')),
  purpose text not null,
  row_grain text not null,
  owning_domain text not null,
  authority text not null,
  pii_class text not null check (pii_class in ('none', 'internal', 'personal', 'sensitive')),
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('draft', 'active', 'deprecated', 'retired')),
  replacement_object text,
  primary key (schema_name, object_name)
);

create table if not exists meta.column_annotation (
  schema_name text not null,
  table_name text not null,
  column_name text not null,
  meaning text not null,
  authority text not null,
  null_meaning text,
  unit text,
  pii_class text not null check (pii_class in ('none', 'internal', 'personal', 'sensitive')),
  is_derived boolean not null default false,
  primary key (schema_name, table_name, column_name),
  foreign key (schema_name, table_name)
    references meta.object_annotation(schema_name, object_name)
    on delete cascade
);

create table if not exists meta.app_contract (
  app_code text not null,
  role_name text not null,
  schema_name text not null,
  object_name text not null,
  access_kind text not null
    check (access_kind in ('read', 'resolve', 'propose', 'write', 'admin')),
  approved_columns text[],
  approved_function text,
  purpose text not null,
  requires_audit boolean not null default false,
  max_rows integer check (max_rows is null or max_rows > 0),
  approved_at timestamptz,
  retired_at timestamptz,
  primary key (app_code, role_name, schema_name, object_name, access_kind)
);

create table if not exists meta.entity_resolution_rule (
  entity_kind text not null check (entity_kind in ('person', 'company', 'tag')),
  rule_version integer not null check (rule_version > 0),
  priority integer not null check (priority > 0),
  match_key text not null,
  normalization text not null,
  auto_match_threshold numeric(6,5),
  requires_review boolean not null default true,
  notes text,
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (entity_kind, rule_version, priority),
  unique (entity_kind, rule_version, match_key)
);

create view meta.table_catalog as
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
  end as object_kind,
  a.purpose,
  a.row_grain,
  a.owning_domain,
  a.authority,
  a.pii_class,
  a.lifecycle_state,
  a.replacement_object,
  c.reltuples::bigint as estimated_row_count,
  obj_description(c.oid, 'pg_class') as database_comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join meta.object_annotation a
  on a.schema_name = n.nspname and a.object_name = c.relname
where c.relkind in ('r', 'v', 'm')
  and n.nspname not in ('pg_catalog', 'information_schema');

create view meta.column_catalog as
select
  n.nspname as schema_name,
  c.relname as table_name,
  att.attname as column_name,
  format_type(att.atttypid, att.atttypmod) as data_type,
  not att.attnotnull as is_nullable,
  pg_get_expr(def.adbin, def.adrelid) as default_expression,
  a.meaning,
  a.authority,
  a.null_meaning,
  a.unit,
  a.pii_class,
  a.is_derived,
  col_description(c.oid, att.attnum) as database_comment
from pg_attribute att
join pg_class c on c.oid = att.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef def on def.adrelid = c.oid and def.adnum = att.attnum
left join meta.column_annotation a
  on a.schema_name = n.nspname
 and a.table_name = c.relname
 and a.column_name = att.attname
where att.attnum > 0
  and not att.attisdropped
  and c.relkind in ('r', 'v', 'm')
  and n.nspname not in ('pg_catalog', 'information_schema');

create view meta.relationship_catalog as
select
  src_ns.nspname as from_schema,
  src.relname as from_table,
  src_col.attname as from_column,
  dst_ns.nspname as to_schema,
  dst.relname as to_table,
  dst_col.attname as to_column,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class dst on dst.oid = con.confrelid
join pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
join lateral unnest(con.conkey, con.confkey) with ordinality
  as keys(src_attnum, dst_attnum, ordinality) on true
join pg_attribute src_col on src_col.attrelid = src.oid and src_col.attnum = keys.src_attnum
join pg_attribute dst_col on dst_col.attrelid = dst.oid and dst_col.attnum = keys.dst_attnum
where con.contype = 'f';

comment on schema meta is
  'Machine-readable annotations, relationships, resolution rules, releases, and application access contracts for agents and CI.';
comment on table meta.app_contract is
  'Approved application and agent access declarations. This table documents access; PostgreSQL grants and functions enforce it.';
comment on table meta.entity_resolution_rule is
  'Versioned entity matching rules. Name-only person or company matching must require review.';

commit;
