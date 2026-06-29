-- ============================================================
-- AURA OS kernel — migration 0030: working calendars & shifts
-- ------------------------------------------------------------
-- Tracks standard working hours, weekends, public holidays, and
-- dynamic operational adjustments (e.g. Ramadan hours).
-- ============================================================

create table if not exists public.aura_working_calendars (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    text        not null,
  company_id   text,
  name         text        not null,
  weekends     integer[]   not null default array[0, 6], -- 0=Sunday, 6=Saturday
  standard_hours_per_day numeric(4,2) not null default 8.00,
  created_at   timestamptz not null default now()
);

create table if not exists public.aura_calendar_holidays (
  id           uuid        primary key default gen_random_uuid(),
  calendar_id  uuid        not null references public.aura_working_calendars(id) on delete cascade,
  holiday_date date        not null,
  description  text,
  created_at   timestamptz not null default now(),
  constraint uq_aura_calendar_holidays unique (calendar_id, holiday_date)
);

create table if not exists public.aura_calendar_adjustments (
  id           uuid        primary key default gen_random_uuid(),
  calendar_id  uuid        not null references public.aura_working_calendars(id) on delete cascade,
  start_date   date        not null,
  end_date     date        not null,
  working_hours_per_day numeric(4,2) not null, -- e.g. 6.00 for Ramadan
  description  text,
  created_at   timestamptz not null default now()
);

alter table public.aura_working_calendars enable row level security;
alter table public.aura_calendar_holidays enable row level security;
alter table public.aura_calendar_adjustments enable row level security;
