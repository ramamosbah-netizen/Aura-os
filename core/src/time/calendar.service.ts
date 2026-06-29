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
  private readonly inMemoryHolidays = new Map<string, Set<string>>();
  private readonly inMemoryAdjustments = new Map<string, CalendarAdjustment[]>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool | null,
  ) {}

  /**
   * Registers a working calendar definition in-memory (useful for testing or fallback).
   */
  registerInMemoryCalendar(cal: CalendarDefinition, holidays: CalendarHoliday[] = [], adjustments: CalendarAdjustment[] = []): void {
    this.inMemoryCalendars.set(cal.id, cal);
    
    const holidaySet = new Set<string>();
    holidays.forEach(h => holidaySet.add(h.date));
    this.inMemoryHolidays.set(cal.id, holidaySet);

    this.inMemoryAdjustments.set(cal.id, adjustments);
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
}
