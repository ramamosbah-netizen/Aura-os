// C7 (§8 automation) — the CRM's automation rules, as a pure function.
//
// Two deliberate boundaries, both of which cost real capability and both of which are the point:
//
// 1. **Escalations are notifications, not Signals.** A Signal is defined as "a pre-lead commercial
//    possibility" and the Radar exists to triage possibilities into Leads. An overdue follow-up is
//    not a possibility — it is work someone already owns and hasn't done. Routing it to the Radar
//    would make the Radar a to-do list and quietly destroy what a Signal means.
//
// 2. **Nothing here invents routing policy.** "Auto-assignment" in most CRMs means round-robin or
//    territory rules — business decisions this system has never been told. The one rule that is a
//    FACT rather than a policy is: a lead for a company we already serve belongs to whoever already
//    owns that customer. That is the only assignment made here, only ever onto an UNASSIGNED lead,
//    and only on a confident identity match. Everything else stays unassigned and visible as the
//    UNASSIGNED gap that leadAttention already raises — an honest empty seat beats a wrong owner.
//
// **Edge-triggered, not state-triggered.** A sweep that reports every currently-breached SLA on
// every run either spams (hourly) or is useless (once). Instead each finding reports only if the
// moment it *became* true falls inside `windowHours` — the cadence the caller declares it runs at.
// The trade is explicit: the sweep must actually run at that cadence, and running it twice inside
// one window can double-report. Stateless idempotency has a price and this is it.
import {
  LEAD_ATTENTION,
  hoursSince,
  leadAttention,
  resolveIdentity,
  type LeadAttentionGap,
} from '@aura/shared';
import { isLiveActivity } from './domain/activity';

/** What the sweep needs from a Lead. */
export interface AutomationLead {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  assignedTo: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  firstRespondedAt: string | null;
  slaFirstResponseHours: number | null;
  createdAt: string;
}

/** What the sweep needs from an Activity. */
export interface AutomationActivity {
  id: string;
  subject: string;
  status: string;
  dueDate: string | null;
  assigneeId: string | null;
  relatedId: string | null;
  relatedType: string | null;
  relatedName: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** What the sweep needs from an Account to route a lead to its existing owner. */
export interface AutomationAccount {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  ownerId: string | null;
}

export type EscalationKind = 'SLA_BREACHED' | 'ASSIGNMENT_NOT_ACCEPTED' | 'FOLLOW_UP_OVERDUE';

export interface Escalation {
  kind: EscalationKind;
  /** The record that needs a human — lead or activity. */
  refType: 'crm.lead' | 'crm.activity';
  refId: string;
  title: string;
  body: string;
  /** Who is on the hook. Null on an unaccepted/unassigned record — that IS the problem. */
  ownerId: string | null;
  /** Stable identity of this escalation, so a caller that wants to store or compare them can. */
  key: string;
}

export interface AutoAssignment {
  leadId: string;
  leadName: string;
  assigneeId: string;
  accountId: string;
  accountName: string;
  /** Why this lead went to this person — recorded, never implied. */
  reason: string;
}

export interface AutomationRun {
  /** The cadence this run assumed. Findings older than this window are not re-reported. */
  windowHours: number;
  escalations: Escalation[];
  assignments: AutoAssignment[];
}

export interface AutomationInput {
  leads: AutomationLead[];
  activities: AutomationActivity[];
  accounts: AutomationAccount[];
  /** How often the caller runs this. Findings that became true earlier are assumed already sent. */
  windowHours?: number;
}

/** True when `at` crossed `hours` of age inside the last `windowHours` — the edge, not the state. */
function crossedInWindow(
  at: string | null,
  hours: number,
  windowHours: number,
  now: Date,
): boolean {
  const elapsed = hoursSince(at, now);
  if (elapsed === null) return false;
  return elapsed >= hours && elapsed < hours + windowHours;
}

/**
 * Detect what needs a human, and what can be routed without one. Pure: same facts + same `now` ⇒
 * same run. It decides nothing about delivery — the caller owns notifications and writes.
 *
 * Attention gaps are NOT re-derived here: leadAttention stays the single judge, exactly as the
 * Lead Center and My Day use it. This only asks *when* a gap became true, so it can be escalated
 * once rather than forever.
 */
export function detectAutomation(input: AutomationInput, now: Date = new Date()): AutomationRun {
  const windowHours = input.windowHours && input.windowHours > 0 ? input.windowHours : 24;
  const today = now.toISOString().slice(0, 10);

  const escalations: Escalation[] = [];

  const nextOpenByLead = new Map<string, AutomationActivity>();
  const lastTouchByLead = new Map<string, string>();
  for (const a of input.activities) {
    if (!a.relatedId) continue;
    const at = a.completedAt ?? a.createdAt;
    const prevTouch = lastTouchByLead.get(a.relatedId);
    if (!prevTouch || at > prevTouch) lastTouchByLead.set(a.relatedId, at);
    if (!isLiveActivity(a.status) || !a.dueDate) continue;
    const prev = nextOpenByLead.get(a.relatedId);
    if (!prev || (prev.dueDate && a.dueDate < prev.dueDate)) nextOpenByLead.set(a.relatedId, a);
  }

  for (const lead of input.leads) {
    const next = nextOpenByLead.get(lead.id) ?? null;
    // The same judge the whole CRM uses. If it says there is no gap, there is no escalation —
    // this file never gets a second opinion.
    const gaps: LeadAttentionGap[] = leadAttention(
      lead,
      {
        lastTouchIso: lastTouchByLead.get(lead.id) ?? null,
        nextActivityDueIso: next?.dueDate ?? null,
        firstRespondedIso: lead.firstRespondedAt,
      },
      now,
    ).gaps;

    if (gaps.includes('SLA_BREACHED')) {
      const sla = lead.slaFirstResponseHours ?? LEAD_ATTENTION.slaFirstResponseHours;
      if (crossedInWindow(lead.assignedAt, sla, windowHours, now)) {
        escalations.push({
          kind: 'SLA_BREACHED',
          refType: 'crm.lead',
          refId: lead.id,
          title: `First-response SLA breached: ${lead.name}`,
          body: `${lead.name}${lead.companyName ? ` (${lead.companyName})` : ''} was assigned ${sla}h ago and has had no first response.`,
          ownerId: lead.assignedTo,
          key: `sla:${lead.id}:${lead.assignedAt ?? ''}`,
        });
      }
    }

    if (gaps.includes('ASSIGNMENT_NOT_ACCEPTED')) {
      if (crossedInWindow(lead.assignedAt, LEAD_ATTENTION.acceptanceHours, windowHours, now)) {
        escalations.push({
          kind: 'ASSIGNMENT_NOT_ACCEPTED',
          refType: 'crm.lead',
          refId: lead.id,
          title: `Assignment not accepted: ${lead.name}`,
          body: `${lead.name} was routed ${LEAD_ATTENTION.acceptanceHours}h ago and nobody has picked it up. Routing is not ownership until it is accepted.`,
          ownerId: lead.assignedTo,
          key: `accept:${lead.id}:${lead.assignedAt ?? ''}`,
        });
      }
    }
  }

  // Overdue follow-ups — the work itself, not the record it hangs off. Edge-triggered on the day it
  // went overdue, so a task left open for a month escalates once, not thirty times.
  const overdueWindowDays = Math.max(1, Math.ceil(windowHours / 24));
  for (const a of input.activities) {
    if (!isLiveActivity(a.status) || !a.dueDate) continue;
    const due = a.dueDate.slice(0, 10);
    if (due >= today) continue;
    const daysLate = Math.floor(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000,
    );
    if (daysLate > overdueWindowDays) continue;
    escalations.push({
      kind: 'FOLLOW_UP_OVERDUE',
      refType: 'crm.activity',
      refId: a.id,
      title: `Follow-up overdue: ${a.subject}`,
      body: `"${a.subject}"${a.relatedName ? ` on ${a.relatedName}` : ''} was due ${a.dueDate} and is still open.`,
      ownerId: a.assigneeId,
      key: `overdue:${a.id}:${a.dueDate}`,
    });
  }

  // Routing — the only rule that is a fact, not a policy.
  const assignments: AutoAssignment[] = [];
  const routable = input.accounts.filter((a) => a.ownerId);
  for (const lead of input.leads) {
    if (lead.assignedTo) continue; // never re-route work that already has an owner
    if (lead.status === 'converted' || lead.status === 'disqualified') continue;
    const match = resolveIdentity(
      { name: lead.companyName ?? lead.name, email: lead.email, phone: lead.phone },
      routable.map((a) => ({ id: a.id, name: a.name, email: a.email ?? null, phone: a.phone ?? null })),
    );
    // Only an EXACT match routes. PROBABLE is the confidence the conversion flow shows a human for
    // confirmation — good enough to suggest, not good enough to act on unattended. A guess would
    // put a real customer in the wrong person's hands, which is strictly worse than the empty seat
    // leadAttention already flags.
    if (match.best !== 'EXACT') continue;
    const top = match.matches.find((m) => m.confidence === 'EXACT');
    const account = top ? routable.find((a) => a.id === top.id) : undefined;
    if (!account?.ownerId) continue;
    assignments.push({
      leadId: lead.id,
      leadName: lead.name,
      assigneeId: account.ownerId,
      accountId: account.id,
      accountName: account.name,
      reason: `matches existing account "${account.name}" — routed to its owner`,
    });
  }

  return { windowHours, escalations, assignments };
}
