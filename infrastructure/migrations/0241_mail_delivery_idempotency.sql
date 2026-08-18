-- ============================================================
-- AURA OS — migration 0238: Delivery idempotency (C3.4b)
-- ------------------------------------------------------------
-- Closes the one window C3.3 left open:
--
--   provider accepts the message → process crashes → AURA never records `sent` → restart
--
-- The message is left in `sending`, and that state is genuinely AMBIGUOUS: it may have gone out,
-- or it may not. Resending risks a duplicate the recipient sees; not sending risks a mail the user
-- believes they sent. Neither is acceptable as a guess, so this makes the question ANSWERABLE.
--
-- Two mechanisms, in order of preference:
--
--   1. delivery_key — a stable, AURA-minted idempotency key attached BEFORE the first attempt.
--      Providers that honour an idempotency key deduplicate the retry themselves, which is the
--      only true exactly-once path available to a client.
--   2. internet_message_id, minted before the attempt too, so a provider without idempotency
--      support can still be ASKED whether it already holds that message.
--
-- When neither is possible the message is parked in `needs_review` rather than silently resent —
-- surfacing an ambiguity to a human beats inventing an answer.
-- ============================================================

alter table public.aura_comms_mail
  -- Stable across every retry of the same message; regenerating it per attempt would defeat it.
  add column if not exists delivery_key       text,
  -- When the current attempt started. A `sending` row older than the recovery threshold is the
  -- crash signature, as distinct from one that is simply in flight right now.
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_attempts   integer not null default 0;

alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_state_check;
alter table public.aura_comms_mail add constraint aura_comms_mail_state_check
  check (state in (
    'draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled', 'received',
    -- Ambiguous after a crash and not resolvable automatically. Terminal until a human decides.
    'needs_review'
  ));

-- sent_at must still agree with the lifecycle; needs_review is not a delivery.
alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_sent_at_check;
alter table public.aura_comms_mail add constraint aura_comms_mail_sent_at_check
  check ((state in ('sent', 'received')) = (sent_at is not null));

-- One delivery_key ⇒ one message. Partial, because only outbound mail that has been queued has one.
create unique index if not exists uq_comms_mail_delivery_key
  on public.aura_comms_mail (tenant_id, delivery_key)
  where delivery_key is not null;

-- The recovery sweep's query: messages stuck mid-attempt.
create index if not exists idx_comms_mail_sending
  on public.aura_comms_mail (tenant_id, delivery_started_at)
  where state = 'sending';

-- @DOWN
drop index if exists public.idx_comms_mail_sending;
drop index if exists public.uq_comms_mail_delivery_key;
update public.aura_comms_mail set state = 'failed', sent_at = null where state = 'needs_review';
alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_state_check;
alter table public.aura_comms_mail add constraint aura_comms_mail_state_check
  check (state in ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled', 'received'));
alter table public.aura_comms_mail
  drop column if exists delivery_attempts,
  drop column if exists delivery_started_at,
  drop column if exists delivery_key;
