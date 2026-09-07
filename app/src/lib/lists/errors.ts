// List Manager — errors + Result helpers
// Rust-ready: no throw in core; every fallible fn returns Result<T, ListError>.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type ListError =
  | { readonly kind: "not_found"; readonly what: string; readonly id: string }
  | { readonly kind: "validation"; readonly issues: readonly string[] }
  | { readonly kind: "unknown_field"; readonly field: string; readonly entity_type: string }
  | { readonly kind: "unsupported_op"; readonly op: string; readonly field: string }
  | { readonly kind: "type_mismatch"; readonly field: string; readonly expected: string; readonly got: string }
  | { readonly kind: "empty_group"; readonly group: "and" | "or" }
  | { readonly kind: "db"; readonly message: string; readonly code?: string }
  | { readonly kind: "config"; readonly message: string };

export function formatListError(e: ListError): string {
  switch (e.kind) {
    case "not_found":
      return `${e.what} not found: ${e.id}`;
    case "validation":
      return `validation failed: ${e.issues.join("; ")}`;
    case "unknown_field":
      return `unknown field '${e.field}' for entity '${e.entity_type}'`;
    case "unsupported_op":
      return `operator '${e.op}' not supported on field '${e.field}'`;
    case "type_mismatch":
      return `type mismatch on '${e.field}': expected ${e.expected}, got ${e.got}`;
    case "empty_group":
      return `empty ${e.group}-group is not allowed`;
    case "db":
      return `database error${e.code ? ` [${e.code}]` : ""}: ${e.message}`;
    case "config":
      return `configuration error: ${e.message}`;
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}
