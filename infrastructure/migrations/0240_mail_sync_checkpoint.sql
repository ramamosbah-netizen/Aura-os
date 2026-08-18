-- ============================================================
-- AURA OS — migration 0237: Mail sync checkpoint (C3.4)
-- ------------------------------------------------------------
-- Per-account sync state for the inbound engine. A cursor is what makes a poll resumable: without
-- one, every restart either re-reads the whole mailbox (and leans entirely on the idempotency
-- index to absorb it) or silently skips whatever arrived while the process was down.
--
-- The cursor is OPAQUE to AURA on purpose — a Gmail historyId, a Graph delta link, an IMAP
-- UIDVALIDITY/UID pair. Interpreting it here would put provider knowledge in the engine, which is
-- exactly what the adapter contract exists to prevent.
--
-- Additive only: no existing column changes, no data moves.
-- ============================================================

alter table public.aura_comms_accounts
  add column if not exists sync_cursor     text,
  -- Separate from `status`: an account can be perfectly connected and still have a failing sync
  -- (a revoked scope, a rate limit). Collapsing the two would hide one behind the other.
  add column if not exists sync_state      text not null default 'idle',
  add column if not exists last_sync_error text,
  add column if not exists last_sync_at    timestamptz;

alter table public.aura_comms_accounts drop constraint if exists aura_comms_accounts_sync_state_check;
alter table public.aura_comms_accounts add constraint aura_comms_accounts_sync_state_check
  check (sync_state in ('idle', 'syncing', 'error', 'disabled'));

-- The sync worker's only query: accounts that can receive, oldest sync first.
create index if not exists idx_comms_accounts_sync
  on public.aura_comms_accounts (tenant_id, channel, sync_state, last_sync_at nulls first);

-- @DOWN
drop index if exists public.idx_comms_accounts_sync;
alter table public.aura_comms_accounts drop constraint if exists aura_comms_accounts_sync_state_check;
alter table public.aura_comms_accounts
  drop column if exists last_sync_at,
  drop column if exists last_sync_error,
  drop column if exists sync_state,
  drop column if exists sync_cursor;
