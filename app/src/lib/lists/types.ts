// List Manager — types
// Pure data. No imports from the runtime; safe to consume from client or server.
// Ports 1:1 to Rust enums/structs.
//
// Aligned with canonical schema (post Phase 8):
//   list         — id, name, description, kind, owner, filter jsonb, member_count,
//                  raw jsonb, entity_types text[], last_refreshed_at, created_at, updated_at
//   list_member  — list_id, entity_table ('company'|'contact'), entity_id, added_at,
//                  added_by, source, meta
//   list_filter  — list_id (PK), filter_json, refresh_cadence, last_refreshed_at,
//                  last_member_count, last_error, created_at, updated_at
//   list_binding — id, list_id, binding_type, binding_ref_id, active,
//                  honor_suppressions, suppression_list_ids uuid[], config, timestamps
//   list_version — id, list_id, version_num, member_ids uuid[], member_count,
//                  reason, created_at
//
// App-invented fields (slug, purpose, tags, visibility, pinned, active on list;
// id and role on list_member) do NOT exist on canonical and have been dropped.

export type EntityType = "company" | "contact";

export type ListKind = "static" | "dynamic" | "hybrid" | "suppression";

export type MemberSource =
  | "manual"
  | "dynamic_snapshot"
  | "import"
  | "extension"
  | "api";

export type RefreshCadence = "manual" | "hourly" | "daily" | "on_read";

// Branded IDs prevent mixing up list_id with member_id etc.
export type ListId = string & { readonly __brand: "ListId" };
export type EntityId = string & { readonly __brand: "EntityId" };
export type BindingId = string & { readonly __brand: "BindingId" };

export const asListId = (s: string): ListId => s as ListId;
export const asEntityId = (s: string): EntityId => s as EntityId;
export const asBindingId = (s: string): BindingId => s as BindingId;

export type List = {
  readonly id: ListId;
  readonly name: string;
  readonly description: string | null;
  readonly kind: ListKind;
  readonly entity_types: readonly EntityType[];
  readonly owner: string | null;
  readonly member_count: number;
  readonly filter: Readonly<Record<string, unknown>>;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly last_refreshed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

// list_member is keyed by (list_id, entity_table, entity_id) — no synthetic id, no role.
export type ListMember = {
  readonly list_id: ListId;
  readonly entity_type: EntityType;   // maps to entity_table
  readonly entity_id: EntityId;
  readonly source: MemberSource;
  readonly added_at: string;
  readonly added_by: string | null;
  readonly meta: Readonly<Record<string, unknown>>;
};

export type EffectiveMember = {
  readonly entity_type: EntityType;
  readonly entity_id: EntityId;
};

export type ListBinding = {
  readonly id: BindingId;
  readonly list_id: ListId;
  readonly binding_type: string;
  readonly binding_ref_id: string | null;
  readonly honor_suppressions: boolean;
  readonly suppression_list_ids: readonly ListId[];
  readonly active: boolean;
  readonly config: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ListFilter = {
  readonly list_id: ListId;
  readonly filter_json: FilterExpr;
  readonly refresh_cadence: RefreshCadence;
  readonly last_refreshed_at: string | null;
  readonly last_member_count: number | null;
  readonly last_error: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

// -------------------------------------------------------------
// Filter expression tree — dynamic membership definition
// -------------------------------------------------------------
// Ports to Rust as:
//   enum FilterExpr { And { clauses: Vec<FilterExpr> }, Or {...}, Not {...}, Cond {...} }

export type FilterOp =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains" // array contains value
  | "like" // ILIKE with %..%
  | "is_null"
  | "is_not_null";

export type FilterCond = {
  readonly kind: "cond";
  readonly field: string;
  readonly op: FilterOp;
  readonly value?: FilterValue;
};

export type FilterAnd = {
  readonly kind: "and";
  readonly clauses: readonly FilterExpr[];
};

export type FilterOr = {
  readonly kind: "or";
  readonly clauses: readonly FilterExpr[];
};

export type FilterNot = {
  readonly kind: "not";
  readonly clause: FilterExpr;
};

export type FilterExpr = FilterCond | FilterAnd | FilterOr | FilterNot;

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | readonly (string | number | boolean)[];

// Per-entity target for a compiled filter
export type FilterTarget = {
  readonly entity_type: EntityType;
  readonly table: string; // canonical singular: "company" | "contact"
  readonly id_column: string; // "id"
  readonly allowed_fields: Readonly<Record<string, FieldSpec>>;
};

export type FieldSpec = {
  readonly column: string;
  readonly kind: "text" | "int" | "numeric" | "bool" | "timestamp" | "text_array";
};
