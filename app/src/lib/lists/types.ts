// List Manager — types
// Pure data. No imports from the runtime; safe to consume from client or server.
// Ports 1:1 to Rust enums/structs.

export type EntityType = "company" | "contact";

export type ListKind = "static" | "dynamic" | "hybrid" | "suppression";

export type MemberRole = "include" | "exclude";

export type MemberSource =
  | "manual"
  | "dynamic_snapshot"
  | "import"
  | "extension"
  | "api";

export type RefreshCadence = "manual" | "hourly" | "daily" | "on_read";

export type Visibility = "private" | "team" | "public";

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
  readonly slug: string | null;
  readonly description: string | null;
  readonly kind: ListKind;
  readonly entity_types: readonly EntityType[];
  readonly purpose: string | null;
  readonly tags: readonly string[];
  readonly owner: string | null;
  readonly visibility: Visibility;
  readonly pinned: boolean;
  readonly active: boolean;
  readonly member_count: number;
  readonly last_refreshed_at: string | null;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ListMember = {
  readonly id: string;
  readonly list_id: ListId;
  readonly entity_type: EntityType;
  readonly entity_id: EntityId;
  readonly role: MemberRole;
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
  readonly table: string; // "companies" | "contacts"
  readonly id_column: string; // "id"
  readonly allowed_fields: Readonly<Record<string, FieldSpec>>;
};

export type FieldSpec = {
  readonly column: string;
  readonly kind: "text" | "int" | "numeric" | "bool" | "timestamp" | "text_array";
};
