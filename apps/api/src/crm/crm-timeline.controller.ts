import { Controller, Get, Inject, Query } from '@nestjs/common';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { ActivityService } from '@aura/crm';
import type { DomainEvent } from '@aura/shared';

// Unified Timeline — one chronological feed per record (account / contact /
// opportunity): domain events on the aggregate (created, stage changes, quotes,
// contracts…) MERGED with the activities logged against it (calls, meetings,
// tasks + their outcomes). Reference + snapshot convention: no joins, just the
// event ledger and the activity stream, normalised and sorted newest-first.

type Tone = 'good' | 'bad' | 'accent' | 'muted';

interface TimelineEntry {
  id: string;
  at: string;
  kind: 'event' | 'activity';
  icon: string;
  title: string;
  detail: string | null;
  tone: Tone;
}

const AGG_ICON: Record<string, string> = {
  opportunity: '◎', quotation: '✎', contract: '▦', account: '◆', contact: '☎',
  lead: '⌥', tender: '◳', project: '▥', activity: '☑',
};
const TYPE_ICON: Record<string, string> = { call: '☎', email: '✉', meeting: '👥', note: '✎', task: '☑' };
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Turn a raw DomainEvent into a human timeline row (no per-event hardcoding needed). */
function eventToEntry(e: DomainEvent): TimelineEntry {
  const parts = e.type.split('.'); // e.g. crm.opportunity.stage_changed
  const aggregate = parts.length >= 2 ? parts[1] : e.aggregateType;
  const verb = (parts[parts.length - 1] ?? '').replace(/_/g, ' ');
  const p = (e.payload ?? {}) as Record<string, unknown>;
  let title = `${cap(aggregate)} ${verb}`;
  let detail: string | null = typeof p.title === 'string' ? p.title : null;
  let tone: Tone = 'accent';

  if (verb === 'stage changed') {
    const to = String(p.stage ?? '');
    title = `Stage → ${to}`;
    detail = p.oldStage ? `from ${String(p.oldStage)}` : null;
    tone = to === 'won' ? 'good' : to === 'lost' ? 'bad' : 'accent';
  } else if (verb.endsWith('created')) {
    tone = 'good';
  }
  return { id: e.id, at: e.occurredAt, kind: 'event', icon: AGG_ICON[aggregate] ?? '⚡', title, detail, tone };
}

@Controller('crm/timeline')
export class CrmTimelineController {
  constructor(
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly activities: ActivityService,
    private readonly tenant: TenantContext,
  ) {}

  /** GET /crm/timeline?id=<recordId>&limit=50 — merged event + activity feed. */
  @Get()
  async timeline(@Query('id') id?: string, @Query('limit') limit?: string): Promise<TimelineEntry[]> {
    if (!id) return [];
    const tenantId = this.tenant.get().tenantId;
    const max = Number(limit) > 0 ? Math.min(Number(limit), 200) : 50;

    const [events, activities] = await Promise.all([
      this.events.list({ tenantId, aggregateId: id, limit: 200 }),
      this.activities.list({ tenantId, limit: 5000 }),
    ]);

    const fromActivities: TimelineEntry[] = activities
      .filter((a) => a.relatedId === id)
      .map((a) => ({
        id: a.id,
        at: a.completedAt ?? a.dueDate ?? a.createdAt,
        kind: 'activity' as const,
        icon: TYPE_ICON[a.type] ?? '·',
        title: `${cap(a.type)} · ${a.subject}`,
        detail: a.outcome ?? a.notes ?? null,
        tone: a.status === 'completed' ? 'good' : a.status === 'cancelled' ? 'muted' : 'accent',
      }));

    const entries = [...events.map(eventToEntry), ...fromActivities];
    entries.sort((a, b) => (a.at < b.at ? 1 : -1));
    return entries.slice(0, max);
  }
}
