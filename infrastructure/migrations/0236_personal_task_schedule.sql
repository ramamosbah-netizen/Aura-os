-- AURA OS — personal task reminder and recurrence metadata.
-- Additive to the existing activity store; My Work does not become a second task owner.

alter table public.aura_crm_activities add column if not exists reminder_at timestamptz;
alter table public.aura_crm_activities add column if not exists reminder_sent_at timestamptz;
alter table public.aura_crm_activities add column if not exists recurrence text not null default 'none';
alter table public.aura_crm_activities add column if not exists recurrence_ends_on text;
alter table public.aura_crm_activities add column if not exists recurrence_series_id text;

create index if not exists idx_crm_activities_due_reminders
  on public.aura_crm_activities (tenant_id, assignee_id, reminder_at)
  where reminder_at is not null and reminder_sent_at is null and status in ('open', 'in_progress');

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aura_crm_activities_recurrence_check') then
    alter table public.aura_crm_activities add constraint aura_crm_activities_recurrence_check
      check (recurrence in ('none', 'daily', 'weekly', 'monthly'));
  end if;
end $$;

-- @DOWN
drop index if exists public.idx_crm_activities_due_reminders;
alter table public.aura_crm_activities drop constraint if exists aura_crm_activities_recurrence_check;
alter table public.aura_crm_activities drop column if exists recurrence_series_id;
alter table public.aura_crm_activities drop column if exists recurrence_ends_on;
alter table public.aura_crm_activities drop column if exists recurrence;
alter table public.aura_crm_activities drop column if exists reminder_sent_at;
alter table public.aura_crm_activities drop column if exists reminder_at;
