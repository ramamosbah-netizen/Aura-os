import { Controller, Get } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { ActivityService, LeadService, lastActivityByRecord } from '@aura/crm';
import {
  leadAttention,
  assessLeadQualification,
  LEAD_TERMINAL_STATUSES,
  type Lead,
  type LeadAttention,
  type LeadActivityFacts,
  type LeadQualificationAssessment,
} from '@aura/shared';

// Lead Command — the Lead OS "Needs Attention" cockpit. Turns the raw lead list into
// attention-scored rows + view counts (All / Mine / Needs Attention / Nurture), computed
// from leads + the Activity stream. Follow-up facts (last touch, next open activity,
// first response) are DERIVED here from activities and passed into the shared deterministic
// leadAttention() — Activity stays the one source of truth for follow-up work.

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

    const isNurture = (s: string): boolean => (LEAD_TERMINAL_STATUSES as readonly string[]).includes(s);
    const counts = {
      all: rows.length,
      mine: rows.filter((r) => r.assignedToMe).length,
      needsAttention: rows.filter((r) => r.attention.needsAttention).length,
      nurture: rows.filter((r) => isNurture(r.status)).length,
    };

    // Surface the worst first: HIGH before MEDIUM before LOW, then by age.
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    rows.sort((a, b) => {
      const sa = a.attention.severity ? rank[a.attention.severity] : 0;
      const sb = b.attention.severity ? rank[b.attention.severity] : 0;
      return sb - sa || b.ageDays - a.ageDays;
    });

    return { generatedAt: now.toISOString(), counts, leads: rows };
  }
}
