-- AURA OS — migration 0312: preserve the reason for every document conveyance.
-- Engineering release already carried purpose on the domain event, but the DocControl
-- transmittal header discarded it. Keeping the value on the conveyance makes a sent drawing
-- auditable even before/without a multi-document package item.

alter table public.aura_doccontrol_transmittals
  add column if not exists purpose text;

-- @DOWN
alter table public.aura_doccontrol_transmittals
  drop column if exists purpose;
