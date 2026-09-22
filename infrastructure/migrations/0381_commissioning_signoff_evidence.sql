-- ============================================================
-- AURA OS — migration 0381: the witnessed sign-off gets real evidence
--                           (TC-06 / XOP-12 — commissioning)
-- ------------------------------------------------------------
-- A commissioning record has carried `commissioned_by` and `witnessed_by` since 0197, and the
-- controller has required both. Both are FREE TEXT typed by whoever was at the keyboard, and the
-- evidence pack printed two blank ruled lines under "Commissioning Engineer" and "Witness
-- (Consultant / Client)" while its own notes described "the witnessed sign-off".
--
-- So the document asserted a witnessed sign-off and held nothing whatsoever from the witness. The
-- register has said as much since the audit — XOP-12: "witness/client identity fields exist in
-- T&C/Handover, but real signature files were not proved."
--
-- ------------------------------------------------------------
-- WHY A TABLE AND NOT COLUMNS.
--
-- A sign-off has more than one party, and what each party leaves behind depends on HOW it was
-- signed:
--
--   electronic   two distinct artefacts — the engineer's stroke and the witness's
--   paper        ONE scanned test sheet carrying both signatures
--   email        a message from the witness, and no signature at all
--
-- Columns on the record would force a single shape onto all three and would have nowhere to put a
-- second witness, which an ELV handover routinely has (consultant AND client). A row per party,
-- each naming its own signatory and its own document, carries all of it without deciding in
-- advance how many there are or whether two of them point at the same file.
--
-- ------------------------------------------------------------
-- THE THREE RULES THIS TABLE EXISTS TO KEEP.
--
--   signed_by            WHO SIGNED — a label, because a consultant's witness holds no AURA
--                        account. Never derived from the actor.
--   recorded_by          WHO ENTERED IT — the AURA user. The two are never merged, and no
--                        certificate may present the recorder as the signatory.
--   signed_content_hash  WHAT WAS SIGNED — the commissioned result as it stood at sign-off. A
--                        record whose test evidence later changes must not keep printing an old
--                        signature as though the witness had seen the new figures.
--
-- `method` is declared rather than inferred from what happens to be attached: an emailed
-- confirmation proves acceptance and proves nothing about a signature, and a document that cannot
-- say which it holds will print the wrong one.
-- ============================================================

create table if not exists public.aura_commissioning_signoff_evidence (
  id                  uuid        primary key,
  tenant_id           text        not null,
  company_id          text,
  commissioning_id    uuid        not null,
  project_id          text        not null,
  -- Which side of the sign-off this is. Two parties today; the column is text so a second
  -- witness does not need a migration to exist.
  party               text        not null,               -- commissioning_engineer | witness
  -- WHO SIGNED. A label, not a user id.
  signed_by           text        not null,
  -- HOW. electronic | paper | email — declared, never inferred from the file.
  method              text        not null,
  -- WHAT PROVES IT. A DMS document; two rows may legitimately name the SAME document when one
  -- scanned sheet carries both signatures.
  document_id         text        not null,
  document_hash       text        not null,
  -- WHAT IT COVERS: the commissioned result at the moment it was signed.
  signed_content_hash text        not null,
  -- WHO ENTERED IT in AURA. Null only for rows written before this column meant anything, of
  -- which there are none — this table starts here.
  recorded_by         text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_cx_signoff_evidence_record
  on public.aura_commissioning_signoff_evidence (tenant_id, commissioning_id);

-- ONE ROW PER PARTY PER RECORD. A second signature for the same party is a correction, not an
-- addition, and two rows would leave every reader choosing between them.
create unique index if not exists uq_cx_signoff_evidence_party
  on public.aura_commissioning_signoff_evidence (tenant_id, commissioning_id, party);

alter table public.aura_commissioning_signoff_evidence enable row level security;
alter table public.aura_commissioning_signoff_evidence force row level security;
drop policy if exists tenant_isolation on public.aura_commissioning_signoff_evidence;
create policy tenant_isolation on public.aura_commissioning_signoff_evidence
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- WHO RECORDED THE SIGN-OFF ITSELF, on the record. The commission route took no actor at all, so
-- the act that closes a system's testing was performed by nobody as far as the record knew.
alter table public.aura_commissioning_records
  add column if not exists commission_recorded_by text;

comment on column public.aura_commissioning_records.commission_recorded_by is
  'The AURA user who recorded the sign-off. `commissioned_by` and `witnessed_by` stay LABELS naming the people who signed — a witness holds no AURA account — and this is who entered it. Never conflated.';

-- @DOWN
alter table public.aura_commissioning_records drop column if exists commission_recorded_by;
drop table if exists public.aura_commissioning_signoff_evidence;
