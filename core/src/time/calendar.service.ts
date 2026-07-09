import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface CalendarDefinition {
  id: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  weekends: number[]; // 0 = Sunday, 6 = Saturday
  standardHoursPerDay: number;
}

export interface CalendarHoliday {
  date: string; // ISO date string (YYYY-MM-DD)
  description: string | null;
}

export interface CalendarAdjustment {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  workingHoursPerDay: number;
  description: string | null;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger('CalendarService');

  // Fallback in-memory database for testing/offline runs
  private readonly inMemoryCalendars = new Map<string, CalendarDefinition>();
  private readonly inMemoryHolidays = new Map<string, Map<string, string | null>>();
  private readonly inMemoryAdjustments = new Map<string, Array<CalendarAdjustment & { id: string }>>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /**
   * Registers a working calendar definition in-memory (useful for testing or fallback).
   */
  registerInMemoryCalendar(cal: CalendarDefinition, holidays: CalendarHoliday[] = [], adjustments: CalendarAdjustment[] = []): void {
    this.inMemoryCalendars.set(cal.id, cal);

    const holidayMap = new Map<string, string | null>();
    holidays.forEach(h => holidayMap.set(h.date, h.description));
    this.inMemoryHolidays.set(cal.id, holidayMap);

    this.inMemoryAdjustments.set(cal.id, adjustments.map((a, i) => ({ ...a, id: `adj-${i}` })));
  }

  /**
   * Calculates the working hours for a specific day under a calendar.
   * If the day is a weekend or holiday, returns 0.
   * If there is an adjustment (e.g. Ramadan hours), returns the adjusted hour limit.
   */
  async getWorkingHoursForDay(calendarId: string, date: Date): Promise<number> {
    const formattedDate = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay(); // 0 = Sunday, ..., 6 = Saturday

    if (!this.pool) {
      const cal = this.inMemoryCalendars.get(calendarId);
      if (!cal) return 8.00; // default standard hours

      if (cal.weekends.includes(dayOfWeek)) return 0;
      
      const holidays = this.inMemoryHolidays.get(calendarId);
      if (holidays?.has(formattedDate)) return 0;

      const adjustments = this.inMemoryAdjustments.get(calendarId) ?? [];
      const activeAdjustment = adjustments.find(
        adj => formattedDate >= adj.startDate && formattedDate <= adj.endDate
      );
      if (activeAdjustment) return activeAdjustment.workingHoursPerDay;

      return cal.standardHoursPerDay;
    }

    try {
      // 1. Fetch calendar configuration
      const calRes = await this.pool.query(
        `SELECT weekends, standard_hours_per_day::float as standard_hours 
         FROM public.aura_working_calendars WHERE id = $1`,
        [calendarId]
      );
      if (calRes.rows.length === 0) return 8.00;

      const { weekends, standard_hours } = calRes.rows[0];
      if ((weekends as number[]).includes(dayOfWeek)) return 0;

      // 2. Check if holiday
      const holidayRes = await this.pool.query(
        `SELECT id FROM public.aura_calendar_holidays 
         WHERE calendar_id = $1 AND holiday_date = $2`,
        [calendarId, formattedDate]
      );
      if (holidayRes.rows.length > 0) return 0;

      // 3. Check adjustments (e.g., Ramadan hours)
      const adjustmentRes = await this.pool.query(
        `SELECT working_hours_per_day::float as hours 
         FROM public.aura_calendar_adjustments 
         WHERE calendar_id = $1 AND start_date <= $2 AND end_date >= $2`,
        [calendarId, formattedDate]
      );
      if (adjustmentRes.rows.length > 0) {
        return adjustmentRes.rows[0].hours;
      }

      return standard_hours;
    } catch (error: any) {
      this.logger.error(`Error fetching working hours: ${error.message}`);
      return 8.00;
    }
  }

  /**
   * Adds N working days to a start date, skipping weekends and holidays.
   */
  async addWorkingDays(calendarId: string, startDate: Date, days: number): Promise<Date> {
    const currentDate = new Date(startDate.getTime());
    let remainingDays = days;
    const direction = days >= 0 ? 1 : -1;
    remainingDays = Math.abs(remainingDays);

    while (remainingDays > 0) {
      currentDate.setDate(currentDate.getDate() + direction);
      const hours = await this.getWorkingHoursForDay(calendarId, currentDate);
      if (hours > 0) {
        remainingDays--;
      }
    }
    return currentDate;
  }

  /**
   * Returns the count of working days between two dates.
   */
  async getWorkingDays(calendarId: string, startDate: Date, endDate: Date): Promise<number> {
    const start = new Date(Math.min(startDate.getTime(), endDate.getTime()));
    const end = new Date(Math.max(startDate.getTime(), endDate.getTime()));

    let workingDays = 0;
    const current = new Date(start.getTime());

    while (current <= end) {
      const hours = await this.getWorkingHoursForDay(calendarId, current);
      if (hours > 0) {
        workingDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    return workingDays;
  }

  // ── Admin CRUD (Admin Center phase 2, Vol 15 §2.1 business calendar) ──────

  async listCalendars(tenantId: string): Promise<CalendarDefinition[]> {
    if (!this.pool) {
      return [...this.inMemoryCalendars.values()].filter((c) => c.tenantId === tenantId);
    }
    const { rows } = await this.pool.query(
      `SELECT id, tenant_id, company_id, name, weekends, standard_hours_per_day::float AS hours
         FROM public.aura_working_calendars WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      companyId: r.company_id ?? null,
      name: r.name,
      weekends: r.weekends ?? [],
      standardHoursPerDay: Number(r.hours),
    }));
  }

  /** Create (id omitted) or update a calendar. Returns the persisted definition. */
  async saveCalendar(cal: Omit<CalendarDefinition, 'id'> & { id?: string }): Promise<CalendarDefinition> {
    if (!this.pool) {
      const id = cal.id ?? `cal-${Date.now().toString(36)}`;
      const def: CalendarDefinition = { ...cal, id };
      this.inMemoryCalendars.set(id, def);
      if (!this.inMemoryHolidays.has(id)) this.inMemoryHolidays.set(id, new Map());
      if (!this.inMemoryAdjustments.has(id)) this.inMemoryAdjustments.set(id, []);
      return def;
    }
    if (cal.id) {
      await this.pool.query(
        `UPDATE public.aura_working_calendars
            SET name = $3, weekends = $4, standard_hours_per_day = $5, company_id = $6
          WHERE id = $1 AND tenant_id = $2`,
        [cal.id, cal.tenantId, cal.name, cal.weekends, cal.standardHoursPerDay, cal.companyId],
      );
      return { ...cal, id: cal.id };
    }
    const { rows } = await this.pool.query(
      `INSERT INTO public.aura_working_calendars (tenant_id, company_id, name, weekends, standard_hours_per_day)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cal.tenantId, cal.companyId, cal.name, cal.weekends, cal.standardHoursPerDay],
    );
    return { ...cal, id: rows[0].id };
  }

  /** Delete a calendar (holidays/adjustments cascade). */
  async deleteCalendar(tenantId: string, id: string): Promise<boolean> {
    if (!this.pool) {
      this.inMemoryHolidays.delete(id);
      this.inMemoryAdjustments.delete(id);
      return this.inMemoryCalendars.delete(id);
    }
    const res = await this.pool.query(`DELETE FROM public.aura_working_calendars WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }

  async listHolidays(calendarId: string): Promise<CalendarHoliday[]> {
    if (!this.pool) {
      return [...(this.inMemoryHolidays.get(calendarId)?.entries() ?? [])]
        .map(([date, description]) => ({ date, description }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    const { rows } = await this.pool.query(
      `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS date, description
         FROM public.aura_calendar_holidays WHERE calendar_id = $1 ORDER BY holiday_date`,
      [calendarId],
    );
    return rows.map((r) => ({ date: r.date, description: r.description ?? null }));
  }

  async addHoliday(calendarId: string, date: string, description: string | null): Promise<void> {
    if (!this.pool) {
      const m = this.inMemoryHolidays.get(calendarId) ?? new Map<string, string | null>();
      m.set(date, description);
      this.inMemoryHolidays.set(calendarId, m);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_calendar_holidays (calendar_id, holiday_date, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (calendar_id, holiday_date) DO UPDATE SET description = excluded.description`,
      [calendarId, date, description],
    );
  }

  async removeHoliday(calendarId: string, date: string): Promise<boolean> {
    if (!this.pool) return this.inMemoryHolidays.get(calendarId)?.delete(date) ?? false;
    const res = await this.pool.query(
      `DELETE FROM public.aura_calendar_holidays WHERE calendar_id = $1 AND holiday_date = $2`,
      [calendarId, date],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listAdjustments(calendarId: string): Promise<Array<CalendarAdjustment & { id: string }>> {
    if (!this.pool) return this.inMemoryAdjustments.get(calendarId) ?? [];
    const { rows } = await this.pool.query(
      `SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
              working_hours_per_day::float AS hours, description
         FROM public.aura_calendar_adjustments WHERE calendar_id = $1 ORDER BY start_date`,
      [calendarId],
    );
    return rows.map((r) => ({
      id: r.id,
      startDate: r.start_date,
      endDate: r.end_date,
      workingHoursPerDay: Number(r.hours),
      description: r.description ?? null,
    }));
  }

  async addAdjustment(calendarId: string, adj: CalendarAdjustment): Promise<{ id: string }> {
    if (!this.pool) {
      const list = this.inMemoryAdjustments.get(calendarId) ?? [];
      const withId = { ...adj, id: `adj-${Date.now().toString(36)}` };
      list.push(withId);
      this.inMemoryAdjustments.set(calendarId, list);
      return { id: withId.id };
    }
    const { rows } = await this.pool.query(
      `INSERT INTO public.aura_calendar_adjustments (calendar_id, start_date, end_date, working_hours_per_day, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [calendarId, adj.startDate, adj.endDate, adj.workingHoursPerDay, adj.description],
    );
    return { id: rows[0].id };
  }

  async removeAdjustment(calendarId: string, id: string): Promise<boolean> {
    if (!this.pool) {
      const list = this.inMemoryAdjustments.get(calendarId) ?? [];
      const next = list.filter((a) => a.id !== id);
      this.inMemoryAdjustments.set(calendarId, next);
      return next.length < list.length;
    }
    const res = await this.pool.query(
      `DELETE FROM public.aura_calendar_adjustments WHERE id = $1 AND calendar_id = $2`,
      [id, calendarId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
