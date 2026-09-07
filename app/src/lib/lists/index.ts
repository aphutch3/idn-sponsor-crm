// List Manager — public surface.
// Import from "@/lib/lists" only; do not reach into internal files.

export * from "./types";
export { formatListError, ok, err } from "./errors";
export type { ListError, Result } from "./errors";
export { filterExprSchema } from "./filter-schema";
export type { FilterExprParsed } from "./filter-schema";
export { compileFilter, type CompiledFilter } from "./filter-compile";
export {
  COMPANY_TARGET,
  CONTACT_TARGET,
  targetForEntity,
} from "./filter-fields";
export {
  addMembers,
  archiveList,
  createList,
  effectiveMembers,
  getList,
  listLists,
  refreshDynamicList,
  removeMembers,
  saveFilter,
  updateList,
  type CreateListInput,
  type ListsFilter,
  type MemberInput,
  type RefreshResult,
  type SaveFilterInput,
} from "./client";
