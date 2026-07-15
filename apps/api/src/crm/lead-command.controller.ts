import { Controller, Get } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { ActivityService, LeadService, lastActivityByRecord } from '@aura/crm';
import {
  leadAttention,
  assessLeadQualification,
  type Lead,
  type LeadAttention,
  type LeadActivityFacts,
  type LeadQualificationAssessment,
} from '@aura/shared';

// Lead Command — the Lead OS cockpit. Turns the raw lead list into attention-scored rows
// + view counts (All / Mine / Needs Attention / Nurture / Converted / Disqualified), computed
// from leads + the Activity stream. Follow-up facts (last touch, next open activity,
// first response) are DERIVED here from activities and passed into the shared deterministic
// leadAttention() — Activity stays the one source of truth for follow-up work.
//
// G7 also derives SOURCE PERFORMANCE on every read: per source, how many leads arrived,
// how many converted or died, and how fast — the answer to "which channels actually
// produce work?" that the funnel views alone cannot give. Nothing is stored; the numbers
// are a projection of the leads themselves.

interface LeadCommandRow {
  id: string;
  name: string;
  companyName: string | null;
  status: string;
  source: string | null;
  assignedTo: string | null;
  assignedToMe: boolean;
  createdAt: string;
  ageDays: number;
  lastActivityIso: string | null;
  nextActivityDueIso: string | null;
  attention: LeadAttention;
  /**
   * G3 — the qualification verdict, derived from the stored dimensions on every read (never a
   * cached score). `attention` says whether anyone is WORKING the lead; this says whether the
   * lead is WORTH working. The Lead Center needs both to be useful.
   */
  qualification: LeadQualificationAssessment;
}

/** One source's funnel, derived from the leads themselves (never stored). */
interface SourcePerformance {
  source: string;
  total: number;
  /** Still being worked — not converted, disqualified or parked in nurture. */
  active: number;
  converted: number;
  disqualified: number;
  nurturing: number;
  needsAttention: number;
  /** converted / total, in whole percent — comparable across sources of any size. */
  conversionRate: number;
  /** How old this source's leads are on average — a slow source reads differently to a dead one. */
  avgAgeDays: number;
}

const daysBetween = (iso: string): number => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

@Controller('crm/leads')
export class LeadCommandController {
  constructor(
    private readonly leads: LeadService,
    private readonly activities: ActivityService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('command')
  async command(): Promise<unknown> {
    const ctx = this.tenant.get();
    const tenantId = ctx.tenantId;
    const me = ctx.actorId ?? null;

    const [leads, activities] = await Promise.all([
      this.leads.list({ tenantId, limit: 5000 }),
      this.activities.list({ tenantId, limit: 5000 }),
    ]);

    // Facts derived from the Activity stream, per lead.
    const leadActivities = activities.filter((a) => a.relatedType === 'lead');
    const lastTouch = lastActivityByRecord(leadActivities); // most-recent touch per relatedId

    // Earliest open follow-up due date, and the first-response touch, per lead id.
    const nextDue = new Map<string, string>();
    const firstResponse = new Map<string, string>();
    for (const a of leadActivities) {
      if (!a.relatedId) continue;
      if (a.status === 'open' && a.dueDate) {
        const prev = nextDue.get(a.relatedId);
        if (!prev || a.dueDate < prev) nextDue.set(a.relatedId, a.dueDate);
      }
      const touch = a.completedAt ?? a.createdAt;
      const prevFr = firstResponse.get(a.relatedId);
      if (!prevFr || touch < prevFr) firstResponse.set(a.relatedId, touch);
    }

    const now = new Date();
    const rows: LeadCommandRow[] = (leads as Lead[]).map((l) => {
      const facts: LeadActivityFacts = {
        lastTouchIso: lastTouch.get(l.id) ?? null,
        nextActivityDueIso: nextDue.get(l.id) ?? l.nextActivityDue ?? null,
        firstRespondedIso: l.firstRespondedAt ?? firstResponse.get(l.id) ?? null,
      };
      return {
        id: l.id,
        name: l.name,
        companyName: l.companyName,
        status: l.status,
        source: l.source,
        assignedTo: l.assignedTo,
        assignedToMe: me !== null && l.assignedTo === me,
        createdAt: l.createdAt,
        ageDays: daysBetween(l.createdAt),
        lastActivityIso: facts.lastTouchIso ?? null,
        nextActivityDueIso: facts.nextActivityDueIso ?? null,
        attention: leadAttention(l, facts, now),
        qualification: assessLeadQualification(l.qualificationDimensions ?? {}),
      };
    });

    // G7 — Converted and Disqualified are their own views now, so Nurture means exactly
    // what it says: parked-but-alive. Lumping the dead and the won into "nurture" was
    // hiding both outcomes.
    const counts = {
      all: rows.length,
      mine: rows.filter((r) => r.assignedToMe).length,
      needsAttention: rows.filter((r) => r.attention.needsAttention).length,
      nurture: rows.filter((r) => r.status === 'nurturing').length,
      converted: rows.filter((r) => r.status === 'converted').length,
      disqualified: rows.filter((r) => r.status === 'disqualified').length,
    };

    // Source performance — group by source ('unknown' is a real answer: it means the
    // team is not recording where work comes from, which is itself worth surfacing).
    const bySource = new Map<string, LeadCommandRow[]>();
    for (const r of rows) {
      const key = r.source?.trim() || 'unknown';
      const bucket = bySource.get(key);
      if (bucket) bucket.push(r); else bySource.set(key, [r]);
    }
    const sources: SourcePerformance[] = [...bySource.entries()]
      .map(([source, group]) => {
        const converted = group.filter((r) => r.status === 'converted').length;
        const disqualified = group.filter((r) => r.status === 'disqualified').length;
        const nurturing = group.filter((r) => r.status === 'nurturing').length;
        return {
          source,
          total: group.length,
          active: group.length - converted - disqualified - nurturing,
          converted,
          disqualified,
          nurturing,
          needsAttention: group.filter((r) => r.attention.needsAttention).length,
          conversionRate: Math.round((converted / group.length) * 100),
          avgAgeDays: Math.round(group.reduce((s, r) => s + r.ageDays, 0) / group.length),
        };
      })
      .sort((a, b) => b.total - a.total);

    // Surface the worst first: HIGH before MEDIUM before LOW, then by age.
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    rows.sort((a, b) => {
      const sa = a.attention.severity ? rank[a.attention.severity] : 0;
      const sb = b.attention.severity ? rank[b.attention.severity] : 0;
      return sb - sa || b.ageDays - a.ageDays;
    });

    return { generatedAt: now.toISOString(), counts, sources, leads: rows };
  }
}
