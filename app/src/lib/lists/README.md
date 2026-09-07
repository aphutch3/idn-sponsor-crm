# List Manager

Reusable polymorphic lists + suppression + bindings for IDN · The Engager.

## Concepts

- **List** — named collection with a `kind`:
  - `static` — explicit rows in `list_members`
  - `dynamic` — membership computed from `list_filters.filter_json`, snapshotted on refresh
  - `hybrid` — dynamic base + manual `include`/`exclude` overrides
  - `suppression` — global excludes; any consumer that opts in subtracts these
- **Polymorphic** — `list_members` stores `(entity_type, entity_id)`. A list's `entity_types` array declares what it accepts (`['company']`, `['contact']`, or both).
- **Bindings** — how features (LinkedIn monitor, email send, ad audience, survey) subscribe to a list. Each binding decides whether to honor suppressions and which ones.
- **Effective members** — every consumer reads via `effectiveMembers(list_id)` which resolves the base membership, applies hybrid overrides, and subtracts suppressions. Single source of truth.

## Usage

```ts
import {
  createList,
  addMembers,
  effectiveMembers,
  saveFilter,
  refreshDynamicList,
} from "@/lib/lists";

// Static list
const staticRes = await createList({
  name: "Q4 Sponsor Watchlist",
  kind: "static",
  entity_types: ["company"],
  purpose: "linkedin_monitoring",
});
if (staticRes.ok) {
  await addMembers(staticRes.value.id, [
    { entity_type: "company", entity_id: someCompanyId },
  ]);
}

// Dynamic list — top sponsors currently in Stay On Top
const dynRes = await createList({
  name: "Top 200 Priority Companies",
  kind: "dynamic",
  entity_types: ["company"],
  purpose: "linkedin_monitoring",
});
if (dynRes.ok) {
  await saveFilter({
    list_id: dynRes.value.id,
    refresh_cadence: "daily",
    filter_json: {
      kind: "and",
      clauses: [
        { kind: "cond", field: "sponsor_tier_rank", op: "lte", value: 200 },
        { kind: "cond", field: "stay_on_top", op: "eq", value: true },
      ],
    },
  });
  await refreshDynamicList(dynRes.value.id);
}

// Consumer read (LinkedIn monitor, email send, etc.)
const membersRes = await effectiveMembers(dynRes.value.id);
if (membersRes.ok) {
  for (const m of membersRes.value) {
    // fetch, send, monitor...
  }
}
```

## Filter expression grammar

Structured JSON tree, validated by `filterExprSchema` (zod), compiled by `compileFilter` to parameterized SQL.

- Leaf: `{ kind: "cond", field, op, value? }`
- Group: `{ kind: "and" | "or", clauses: [...] }`
- Negation: `{ kind: "not", clause: {...} }`

Operators by field kind:

| Field kind    | Allowed operators                                          |
| ------------- | ---------------------------------------------------------- |
| `text`        | `eq`, `neq`, `in`, `nin`, `like`, `is_null`, `is_not_null` |
| `int`/`num`/`ts` | `eq`, `neq`, `in`, `nin`, `gt/gte/lt/lte`, `is_null`, `is_not_null` |
| `bool`        | `eq`, `neq`, `is_null`, `is_not_null`                      |
| `text_array`  | `contains`, `is_null`, `is_not_null`                       |

Fields must appear in `filter-fields.ts` for the target entity — unknown fields are rejected at compile time.

## Design invariants

1. **No throws in the library.** Every fn returns `Result<T, ListError>`.
2. **Whitelisted fields only.** `compileFilter` refuses any field not in `filter-fields.ts`.
3. **Parameterized SQL.** Values are always bound via `$N`, never string-inlined.
4. **Effective members is the only consumer contract.** Never read `list_members` directly from a feature.
5. **Refresh writes an audit version.** Every `refreshDynamicList` inserts a `list_versions` row.

## Rust port

This library follows `rust-ready-typescript`. `types.ts`, `errors.ts`, `filter-schema.ts`, `filter-compile.ts`, and `filter-fields.ts` are core (pure, portable). `client.ts` is shell (Supabase-specific).
