import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '@aura/core';
/**
 * The environment label the DATABASE carries about itself, or null when it carries none.
 *
 * Read from `public.aura_environment`, a table that no migration creates. Only a provisioning step
 * that deliberately marks a throwaway database inserts it, so **absence is the safe default**: a
 * development or production database answers null simply by never having been marked, and nothing
 * has to be remembered to keep it that way.
 *
 * It exists so a destructive test suite can require the TARGET to prove what it is, rather than
 * trusting the runner's word for it. An environment variable is a declaration by whoever typed the
 * command — copy it beside the wrong DATABASE_URL and the declaration is still true and still
 * wrong. This is a property of the database being written to.
 *
 * Reported, never enforced here: the API serves any database it is pointed at. The refusal belongs
 * to the suite that would do the writing.
 */
@Injectable()
export class EnvironmentMarkerService implements OnModuleInit {
  private marker: string | null = null;

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  async onModuleInit(): Promise<void> {
    if (!this.pool) return;
    try {
      const { rows } = await this.pool.query<{ marker: string }>(
        'SELECT marker FROM public.aura_environment LIMIT 1',
      );
      this.marker = rows[0]?.marker ?? null;
    } catch {
      // No such table is the normal case — an unmarked database, which is what a real one is.
      this.marker = null;
    }
  }

  get(): string | null {
    return this.marker;
  }
}
