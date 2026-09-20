# Canonical v1 release candidate

This is the additive canonical identity, normalized forms, taxonomy, access-contract and email-integrity release. It builds on the actual merged Phase 8 schema, not on missing historical migration bytes.

## Execution order

Use `release.py` to execute the lexically ordered `normalized/*.sql` files in one guarded transaction. The default is read-only preflight; `--apply` also requires an exact Git SHA, expected database/count, private `CANONICAL_MIGRATION_DSN`, and recovery snapshot receipt. Never run the older reconstructed P8 chain against the current production schema.

The `p8r2/` directory is historical reconstruction/rehearsal evidence only. It is not the production deployment chain. Fixtures are synthetic and must run only on a disposable clone.

## Canonical contract

- Shared identity is `public.person`. Existing Contact IDs remain valid as a transitional CRM contract. New contacts acquire canonical identity through an audited bridge; suppression is monotonic.
- Five conflicting LinkedIn/email identities are explicitly retained for review in `meta.identity_conflict`. No name-only merges or deletions occur.
- New shared applications should write factual identity changes to `public.person`, not legacy Contact. The bridge is not bidirectional fact synchronization.
- Engager-private profiles live in `engager`; old profile columns remain transitional while remaining readers are moved.
- Survey definitions, versions, questions, choices, submissions and typed answers live in shared `public` tables. Only survey context and template classification live in `surveys`.
- Published form content is immutable, and answer types and cross-form relationships are database-enforced.
- Foreign IDs resolve through `public.external_ref`; original source hashes and legacy keys remain available.
- Taxonomy hierarchy, alias normalization, redirects and source evidence are additive. This release does not automatically merge semantically different tags from other applications.
- Surveys uses a restricted server-side role; no browser database credentials. Existing roles retain their prior grant behavior.
- Email events are append-only and idempotent, with serialized recipient rollups and deterministic timestamp handling.

## Retention and rollback

Keep Surveys Supabase project `jwldivwdbozgxfsqexcy` intact for at least 30 days after verified cutover. No automatic deletion is authorized. Preserve Neon snapshot and encrypted/provider-managed backups, source exports and previous deployment.

Rollback after new Neon submissions is not simply reverting an environment variable: first reconcile new Neon writes back to a recovery dataset, then restore the app under a controlled maintenance window. Do not lose post-cutover responses.

## Remaining compatibility work

Legacy Contact consumers and historical workflow columns are deliberately not dropped. Promote each application to canonical person IDs and app-private profiles through tested code changes before retiring that compatibility surface. Open identity conflicts and cross-app taxonomy reconciliation are explicit governance work, not evidence of lossless automatic deduplication.
