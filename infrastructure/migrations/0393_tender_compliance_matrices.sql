-- ============================================================
-- AURA OS — migration 0393: the Technical Compliance Matrix, issued and kept
-- ------------------------------------------------------------
-- EST-12, the owner's decision of 2026-09-25 ("select (b)"): a separate, server-generated,
-- controlled Technical Compliance Matrix under Technical Manager authority — supplier, quotation
-- revision and line, BOQ/PR-line lineage, verdict, rationale, deviations, evaluator and date — with
-- commercial prices kept out, filed in the internal tender dossier.
--
-- Each row here is one ISSUED REVISION of a tender's matrix: the verdicts frozen at issue, the number
-- and revision, who issued it and when, why it replaced the last one, and the controlled document it
-- was filed as (with the content hash). The database holds what the domain holds:
--
--   * append-only — never deleted; nothing but the one supersede link ever changes, and that once;
--   * one revision number per tender, contiguous from 0, and a re-issue always carries its reason;
--   * the frozen rows are a non-empty array and carry NO commercial figure — the matrix is a technical
--     document, and a price key anywhere in it is refused here as well as in the domain.
-- ============================================================

create table if not exists public.aura_tender_compliance_matrices (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  tender_id       uuid        not null,
  matrix_number   text        not null,
  revision        integer     not null,
  issued_by       text        not null,
  issued_at       timestamptz not null,
  reason          text,
  rows            jsonb       not null,
  summary         jsonb       not null,
  document_id     uuid        not null,
  checksum        text        not null,
  superseded_by   uuid,
  superseded_at   timestamptz,
  constraint aura_tcm_revision check (revision >= 0),
  constraint aura_tcm_one_revision unique (tenant_id, tender_id, revision),
  constraint aura_tcm_number check (coalesce(length(btrim(matrix_number)), 0) > 0),
  constraint aura_tcm_issuer check (coalesce(length(btrim(issued_by)), 0) > 0),
  constraint aura_tcm_reissue_reason check (revision = 0 or coalesce(length(btrim(reason)), 0) > 0),
  constraint aura_tcm_rows check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) > 0),
  constraint aura_tcm_no_prices check (
    rows::text !~* '"(unitPrice|price|amount|lineTotal|total|subtotal|discount|lineDiscount|currency|vat|vatRate|cost|directCost|sellingRate|freightAmount|taxRatePct)"[[:space:]]*:'
  ),
  constraint aura_tcm_checksum check (coalesce(length(btrim(checksum)), 0) > 0),
  constraint aura_tcm_superseded check ((superseded_by is null) = (superseded_at is null))
);

create index if not exists idx_aura_tcm_tender on public.aura_tender_compliance_matrices (tenant_id, tender_id, revision desc);

alter table public.aura_tender_compliance_matrices enable row level security;
alter table public.aura_tender_compliance_matrices force row level security;
drop policy if exists tenant_isolation on public.aura_tender_compliance_matrices;
create policy tenant_isolation on public.aura_tender_compliance_matrices
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create or replace function public.aura_tender_compliance_matrix_guard() returns trigger
language plpgsql as $fn$
declare
  latest integer;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23514',
      message = format('%s Rev %s is a controlled issue and is never deleted', old.matrix_number, old.revision);
  end if;

  if tg_op = 'INSERT' then
    -- Plain INSERTs only (the store never upserts), but judged as new only when it is new.
    if exists (select 1 from public.aura_tender_compliance_matrices m where m.id = new.id) then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('aura-tcm:' || new.tenant_id || ':' || new.tender_id::text));
    select max(m.revision) into latest from public.aura_tender_compliance_matrices m
     where m.tenant_id = new.tenant_id and m.tender_id = new.tender_id;
    if new.revision <> coalesce(latest + 1, 0) then
      raise exception using errcode = '23514',
        message = format('%s Rev %s is not the next revision — the current one is Rev %s', new.matrix_number, new.revision, coalesce(latest::text, 'none'));
    end if;
    if new.superseded_by is not null then
      raise exception using errcode = '23514', message = 'a new matrix revision cannot be issued already superseded';
    end if;
    return new;
  end if;

  -- UPDATE: only the supersede link, and only once.
  if old.superseded_by is not null then
    raise exception using errcode = '23514',
      message = format('%s Rev %s is immutable — it is superseded and keeps what it said', old.matrix_number, old.revision);
  end if;
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id or new.company_id is distinct from old.company_id
     or new.tender_id is distinct from old.tender_id or new.matrix_number is distinct from old.matrix_number
     or new.revision is distinct from old.revision or new.issued_by is distinct from old.issued_by
     or new.issued_at is distinct from old.issued_at or new.reason is distinct from old.reason
     or new.rows is distinct from old.rows or new.summary is distinct from old.summary
     or new.document_id is distinct from old.document_id or new.checksum is distinct from old.checksum then
    raise exception using errcode = '23514',
      message = format('%s Rev %s is immutable — issue the next revision, with a reason, to change it', old.matrix_number, old.revision);
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_tender_compliance_matrix_guard on public.aura_tender_compliance_matrices;
create trigger aura_tender_compliance_matrix_guard
  before insert or update or delete on public.aura_tender_compliance_matrices
  for each row execute function public.aura_tender_compliance_matrix_guard();

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant select, insert, update on public.aura_tender_compliance_matrices to aura_app;
  end if;
end $grant$;

-- @DOWN
drop trigger if exists aura_tender_compliance_matrix_guard on public.aura_tender_compliance_matrices;
drop function if exists public.aura_tender_compliance_matrix_guard();
drop table if exists public.aura_tender_compliance_matrices;
