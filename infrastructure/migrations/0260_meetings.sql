-- AURA OS — migration 0260: Meeting management
-- Meetings own business context and minutes; video/calendar providers remain adapters.

create table if not exists public.aura_comms_meetings (
  id uuid primary key,
  tenant_id text not null,
  company_id text,
  title text not null,
  meeting_type text not null default 'internal_coordination',
  status text not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Dubai',
  location text,
  online_url text,
  organizer_id text not null,
  related_type text,
  related_id text,
  related_name text,
  agenda text,
  minutes text,
  attendees jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aura_comms_meetings_type_check check (meeting_type in ('internal_coordination','client','consultant','site','progress','technical','kickoff','handover')),
  constraint aura_comms_meetings_status_check check (status in ('scheduled','in_progress','completed','cancelled')),
  constraint aura_comms_meetings_time_check check (ends_at > starts_at)
);

create index if not exists idx_comms_meetings_upcoming on public.aura_comms_meetings (tenant_id, starts_at);
create index if not exists idx_comms_meetings_status on public.aura_comms_meetings (tenant_id, status, starts_at);
create index if not exists idx_comms_meetings_related on public.aura_comms_meetings (tenant_id, related_type, related_id);

alter table public.aura_comms_meetings enable row level security;
alter table public.aura_comms_meetings force row level security;
drop policy if exists tenant_isolation on public.aura_comms_meetings;
create policy tenant_isolation on public.aura_comms_meetings
  using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);

-- A meeting is also a Communication timeline subject, without duplicating the meeting record.
create index if not exists idx_comms_timeline_meeting on public.aura_comms_timeline (tenant_id, subject_type, subject_id)
  where subject_type = 'meeting';

-- @DOWN
drop index if exists public.idx_comms_timeline_meeting;
drop table if exists public.aura_comms_meetings;
