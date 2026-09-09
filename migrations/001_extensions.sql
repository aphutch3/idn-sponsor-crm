-- 001_extensions.sql
-- Phase 1 · Step 1.2 · Migration 1 of 9 (DDL)
-- Enable extensions required by canonical schema v2.
-- Idempotent: safe to re-run.

create extension if not exists vector;      -- pgvector: person/company/session embeddings (Q2)
create extension if not exists citext;      -- case-insensitive email/domain (person.email, company.domain)
create extension if not exists pgcrypto;    -- gen_random_uuid() for uuid PKs
create extension if not exists pg_trgm;     -- normalized-name fuzzy dedupe on ingest

-- Verification queries (run after apply):
--   select extname, extversion from pg_extension where extname in ('vector','citext','pgcrypto','pg_trgm');
--   select gen_random_uuid();
--   select ''::citext = 'X'::citext;
