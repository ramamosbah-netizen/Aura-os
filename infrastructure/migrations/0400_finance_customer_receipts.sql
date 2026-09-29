-- ============================================================
-- 0400 — A CUSTOMER RECEIPT IS A RECORD, AND AN INVOICE'S PAID AMOUNT IS THEIR SUM (AR-INV-02)
--
-- `amount_paid` on the customer invoice was a running total and nothing else. Recording a receipt
-- added to it and advanced the status; who recorded which receipt, when the money arrived, for how
-- much and against what bank reference existed nowhere a screen or a reconciliation could read. Two
-- receipts of 5,000 and one of 10,000 were indistinguishable on the row.
--
-- Now:
--   1. each receipt is a row — amount, the date the money was received, the bank reference it
--      reconciles to, who recorded it and when;
--   2. `amount_paid` is DERIVED: the receipts trigger sets it to the sum of the invoice's receipts,
--      and the invoice guard refuses any other writer setting it — so there is no second total that
--      can disagree with the first;
--   3. the rules that were the service's alone are the database's too, under a row lock on the
--      invoice: a receipt only on an issued or part-paid invoice, never past its total, and the
--      status follows the money (covered → paid, otherwise partially paid). Two concurrent receipts
--      serialise on that lock, so both cannot fit into the same balance;
--   4. an invoice carrying receipts cannot be moved to any other status — cancelling one with money
--      on it was refused by the service and is now refused by the table, whatever writes it;
--   5. a receipt is never edited or deleted.
--
-- EXISTING MONEY IS KEPT, HONESTLY. Every invoice already carrying an amount gets ONE legacy receipt
-- for exactly that amount, marked `legacy`, with no date, no bank reference, no recorder and no
-- recording time — because nobody recorded them, and a back-filled value would be a record claiming
-- evidence nobody kept. After the backfill the migration CHECKS that every invoice's amount equals
-- the sum of its receipts, and fails rather than proceed if one does not.
-- ============================================================

create table if not exists public.aura_finance_customer_receipts (
  id              uuid primary key,
  tenant_id       text not null,
  invoice_id      uuid not null references public.aura_finance_customer_invoices(id),
  amount          numeric(14,2) not null,
  received_on     date,
  bank_reference  text,
  recorded_by     text,
  recorded_at     timestamptz,
  legacy          boolean not null default false,
  constraint chk_aura_customer_receipt_amount check (amount > 0),
  -- A receipt names its date, its bank reference and when it was recorded; only a legacy one may not.
  constraint chk_aura_customer_receipt_evidence check (
    legacy
    or (received_on is not null and recorded_at is not null
        and bank_reference is not null and length(btrim(bank_reference)) > 0)
  ),
  -- A legacy receipt claims nothing but its amount.
  constraint chk_aura_customer_receipt_legacy check (
    not legacy or (received_on is null and bank_reference is null and recorded_by is null and recorded_at is null)
  )
);

-- By invoice first: every trigger and every read asks "the receipts of THIS invoice".
create index if not exists ix_aura_customer_receipts_invoice
  on public.aura_finance_customer_receipts (invoice_id);

alter table public.aura_finance_customer_receipts enable row level security;
alter table public.aura_finance_customer_receipts force row level security;
drop policy if exists tenant_isolation on public.aura_finance_customer_receipts;
create policy tenant_isolation on public.aura_finance_customer_receipts
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── the backfill: one legacy receipt per invoice that already carries money ─────────────────────
insert into public.aura_finance_customer_receipts (id, tenant_id, invoice_id, amount, legacy)
select gen_random_uuid(), i.tenant_id, i.id, i.amount_paid, true
from public.aura_finance_customer_invoices i
where i.amount_paid > 0
  and not exists (select 1 from public.aura_finance_customer_receipts r where r.invoice_id = i.id);

do $check$
declare bad integer;
begin
  select count(*) into bad
  from public.aura_finance_customer_invoices i
  where i.amount_paid <> coalesce((select sum(r.amount) from public.aura_finance_customer_receipts r where r.invoice_id = i.id), 0);
  if bad > 0 then
    raise exception '0400: % customer invoice(s) carry an amount paid that their receipts do not sum to', bad;
  end if;
end
$check$;

-- ── the receipts triggers: the only way money reaches an invoice ───────────────────────────────
-- TWO triggers, and the split is what makes concurrency safe. The receipt's foreign key is checked by
-- an AFTER trigger that takes a KEY SHARE lock on the invoice row; if the invoice were only locked FOR
-- UPDATE after that, two receipts inserted at once would each hold KEY SHARE and each wait for the
-- other's — a deadlock (measured: the first version of this migration did exactly that). So the
-- invoice is locked FOR UPDATE BEFORE the insert: the second receipt waits there, and when it resumes
-- the first is committed and counted.
create or replace function public.aura_finance_customer_receipt_admit() returns trigger
language plpgsql as $fn$
declare
  inv record;
begin
  if new.legacy then
    raise exception using errcode = '23514',
      message = 'a legacy receipt is only ever written by migration 0400 — every receipt since carries its date and bank reference';
  end if;
  select id, tenant_id, status into inv
  from public.aura_finance_customer_invoices where id = new.invoice_id for update;
  if not found or inv.tenant_id is distinct from new.tenant_id then
    raise exception using errcode = '23503', message = format('customer invoice %s not found', new.invoice_id);
  end if;
  if inv.status not in ('issued', 'partially_paid') then
    raise exception using errcode = '23514', message = format('cannot record a receipt from status %s', inv.status);
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_finance_customer_receipt_admit on public.aura_finance_customer_receipts;
create trigger aura_finance_customer_receipt_admit
  before insert on public.aura_finance_customer_receipts
  for each row execute function public.aura_finance_customer_receipt_admit();

create or replace function public.aura_finance_customer_receipt_apply() returns trigger
language plpgsql as $fn$
declare
  inv_total numeric(14,2);
  paid  numeric(14,2);
begin
  -- Already locked by the admit trigger; this statement's fresh snapshot counts every committed receipt.
  select i.total into inv_total from public.aura_finance_customer_invoices i where i.id = new.invoice_id for update;
  select coalesce(sum(amount), 0) into paid
  from public.aura_finance_customer_receipts where invoice_id = new.invoice_id;
  if paid > inv_total + 0.001 then
    raise exception using errcode = '23514',
      message = format('receipt exceeds invoice balance (paid %s, total %s)', paid - new.amount, inv_total);
  end if;
  update public.aura_finance_customer_invoices
     set amount_paid = paid,
         status = case when paid >= inv_total - 0.001 then 'paid' else 'partially_paid' end
   where id = new.invoice_id;
  return null;
end
$fn$;

drop trigger if exists aura_finance_customer_receipt_apply on public.aura_finance_customer_receipts;
create trigger aura_finance_customer_receipt_apply
  after insert on public.aura_finance_customer_receipts
  for each row execute function public.aura_finance_customer_receipt_apply();

create or replace function public.aura_finance_customer_receipt_immutable() returns trigger
language plpgsql as $fn$
begin
  raise exception using errcode = '23514',
    message = 'a customer receipt is a record of money received — it is never edited or deleted';
end
$fn$;

drop trigger if exists aura_finance_customer_receipt_immutable on public.aura_finance_customer_receipts;
create trigger aura_finance_customer_receipt_immutable
  before update or delete on public.aura_finance_customer_receipts
  for each row execute function public.aura_finance_customer_receipt_immutable();

-- ── the invoice guard: nobody else writes the paid amount, and the status follows the money ────
create or replace function public.aura_finance_customer_invoice_paid_guard() returns trigger
language plpgsql as $fn$
declare
  paid    numeric(14,2);
  derived text;
begin
  if tg_op = 'INSERT' then
    -- Fires on every upsert as well (INSERT … ON CONFLICT runs BEFORE INSERT triggers first), which is
    -- why the store never sends the column: a new invoice has no receipts, so nothing is paid.
    if new.amount_paid <> 0 then
      raise exception using errcode = '23514',
        message = 'a customer invoice is paid only by its receipts — a new invoice has none';
    end if;
    return new;
  end if;
  if new.amount_paid is distinct from old.amount_paid or new.status is distinct from old.status then
    select coalesce(sum(amount), 0) into paid
    from public.aura_finance_customer_receipts where invoice_id = new.id;
    if new.amount_paid is distinct from paid then
      raise exception using errcode = '23514',
        message = format('amount_paid is the sum of the invoice''s receipts (%s), never a number of its own', paid);
    end if;
    if paid > 0 then
      derived := case when paid >= new.total - 0.001 then 'paid' else 'partially_paid' end;
      if new.status is distinct from derived then
        raise exception using errcode = '23514',
          message = format('an invoice with receipts recorded can only be %s — its status follows its receipts', replace(derived, '_', ' '));
      end if;
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_finance_customer_invoice_paid_guard on public.aura_finance_customer_invoices;
create trigger aura_finance_customer_invoice_paid_guard
  before insert or update on public.aura_finance_customer_invoices
  for each row execute function public.aura_finance_customer_invoice_paid_guard();

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    -- Select and insert only: a receipt is appended, never changed.
    grant select, insert on public.aura_finance_customer_receipts to aura_app;
  end if;
end $grant$;

-- @DOWN
drop trigger if exists aura_finance_customer_invoice_paid_guard on public.aura_finance_customer_invoices;
drop function if exists public.aura_finance_customer_invoice_paid_guard();
drop trigger if exists aura_finance_customer_receipt_immutable on public.aura_finance_customer_receipts;
drop function if exists public.aura_finance_customer_receipt_immutable();
drop trigger if exists aura_finance_customer_receipt_apply on public.aura_finance_customer_receipts;
drop function if exists public.aura_finance_customer_receipt_apply();
drop trigger if exists aura_finance_customer_receipt_admit on public.aura_finance_customer_receipts;
drop function if exists public.aura_finance_customer_receipt_admit();
drop table if exists public.aura_finance_customer_receipts;
