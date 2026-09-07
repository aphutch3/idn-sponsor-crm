// Zod schema for the filter expression tree.
// This is the boundary: raw JSON from UI/API is validated here, then trusted downstream.

import { z } from "zod";
import type { FilterExpr } from "./types";

const filterValueSchema: z.ZodType<
  string | number | boolean | null | readonly (string | number | boolean)[]
> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])).readonly(),
]);

const opSchema = z.enum([
  "eq",
  "neq",
  "in",
  "nin",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "like",
  "is_null",
  "is_not_null",
]);

// Recursive schema — must be typed with z.ZodType<FilterExpr>
export const filterExprSchema: z.ZodType<FilterExpr> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("cond"),
      field: z.string().min(1).max(64),
      op: opSchema,
      value: filterValueSchema.optional(),
    }),
    z.object({
      kind: z.literal("and"),
      clauses: z.array(filterExprSchema).min(1).max(50),
    }),
    z.object({
      kind: z.literal("or"),
      clauses: z.array(filterExprSchema).min(1).max(50),
    }),
    z.object({
      kind: z.literal("not"),
      clause: filterExprSchema,
    }),
  ]),
);

export type FilterExprParsed = z.infer<typeof filterExprSchema>;
