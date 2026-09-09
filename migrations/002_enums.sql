-- 002_enums.sql
-- Phase 1 · Step 1.2 · Migration 2 of 9 (DDL)
-- Canonical enum types used across domains.
-- Idempotent via DO blocks.

-- event.kind (Q7 locked: idn_summit, external_conference only — no 'other')
do $$ begin
  create type event_kind as enum ('idn_summit', 'external_conference');
exception when duplicate_object then null; end $$;

-- Role a person plays at an event when they attend (distinct from session_speaker)
do $$ begin
  create type event_role as enum ('attendee', 'speaker', 'sponsor_rep', 'organizer', 'press', 'vip');
exception when duplicate_object then null; end $$;

-- media_asset.kind
do $$ begin
  create type media_kind as enum ('video', 'audio', 'image', 'doc', 'deck', 'other');
exception when duplicate_object then null; end $$;

-- media_asset.status (Mux-style lifecycle)
do $$ begin
  create type media_status as enum ('uploading', 'processing', 'ready', 'errored', 'archived');
exception when duplicate_object then null; end $$;

-- activity.kind (sales timeline entries)
do $$ begin
  create type activity_kind as enum ('email', 'call', 'meeting', 'linkedin', 'agent_note', 'system_note', 'task_note');
exception when duplicate_object then null; end $$;
