import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ParseUuidOr404Pipe, TenantContext } from '@aura/core';
import {
  AccountService,
  ActivityService,
  ContactService,
  OpportunityService,
  QuotationService,
  type Account,
  type Activity,
  type Contact,
  type Quotation,
} from '@aura/crm';
import type { Opportunity } from '@aura/shared';
import { TenderService, type Tender } from '@aura/tendering';
import { ContractService, type Contract } from '@aura/contracts';
import { ProjectService, type Project } from '@aura/projects';

// Contact 360 — the STAKEHOLDER command center. A contact is a person inside an
// Account; the deals belong to the account, so this person's "involvement" is the
// account's live deal chain, while their PERSONAL signal is the activity timeline
// logged against them (relatedId = contactId) and the derived last interaction.

interface TimelineEntry { at: string; kind: string; label: string; href: string | null }

interface Contact360Payload {
  contact: Contact;
  account: Account | null;
  reportsTo: Contact | null;
  reports: Contact[];
  peers: Array<Pick<Contact, 'id' | 'name' | 'jobTitle' | 'stakeholderRole' | 'relationshipStrength' | 'isPrimary' | 'reportsToId'>>;
  opportunities: Opportunity[];
  tenders: Tender[];
  quotations: Quotation[];
  contracts: Contract[];
  projects: Project[];
  activities: Activity[];
  summary: {
    accountName: string | null;
    openOpportunities: number;
    pipelineValue: number;
    activeContracts: number;
    activeProjects: number;
    interactions: number;
    openActions: number;
    lastInteractionAt: string | null;
  };
  timeline: TimelineEntry[];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

@Controller('crm/contacts')
export class Contact360Controller {
  constructor(
    private readonly contacts: ContactService,
    private readonly accounts: AccountService,
    private readonly opportunities: OpportunityService,
    private readonly quotations: QuotationService,
    private readonly activities: ActivityService,
    private readonly tenders: TenderService,
    private readonly contracts: ContractService,
    private readonly projects: ProjectService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/summary')
  async summary(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Contact360Payload> {
    const tenantId = this.tenant.get().tenantId;
    const contact = await this.contacts.get(id);
    if (!contact || contact.tenantId !== tenantId) throw new NotFoundException(`contact ${id} not found`);

    const accountId = contact.accountId;
    const account = accountId ? await this.accounts.get(accountId) : null;

    const [siblings, opportunities, tenders, quotations, contracts, projects, activities] = await Promise.all([
      accountId ? this.contacts.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.opportunities.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.tenders.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.quotations.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.contracts.list({ tenantId, accountId }) : Promise.resolve([]),
      accountId ? this.projects.list({ tenantId, accountId }) : Promise.resolve([]),
      this.activities.list({ tenantId, relatedId: id }),
    ]);

    const reportsTo = contact.reportsToId ? siblings.find((c) => c.id === contact.reportsToId) ?? null : null;
    const reports = siblings.filter((c) => c.reportsToId === id);
    const peers = siblings
      .filter((c) => c.id !== id)
      .map((c) => ({
        id: c.id, name: c.name, jobTitle: c.jobTitle, stakeholderRole: c.stakeholderRole,
        relationshipStrength: c.relationshipStrength, isPrimary: c.isPrimary, reportsToId: c.reportsToId,
      }));

    const openOpps = opportunities.filter((o) => o.stage !== 'won' && o.stage !== 'lost');
    const openActivities = activities.filter((x) => x.status === 'open');
    const lastInteractionAt = activities.length
      ? activities.map((x) => x.createdAt).sort().at(-1)!
      : null;

    const summary = {
      accountName: contact.accountName ?? account?.name ?? null,
      openOpportunities: openOpps.length,
      pipelineValue: r2(openOpps.reduce((s, o) => s + o.value, 0)),
      activeContracts: contracts.filter((c) => c.status === 'active').length,
      activeProjects: projects.filter((p) => p.status === 'active' || p.status === 'planned').length,
      interactions: activities.length,
      openActions: openActivities.length,
      lastInteractionAt,
    };

    const timeline: TimelineEntry[] = [
      { at: contact.createdAt, kind: 'contact', label: `Added as a contact${summary.accountName ? ` at ${summary.accountName}` : ''}`, href: null },
      ...activities.map((x) => ({
        at: x.createdAt, kind: 'activity',
        label: `${x.type} — ${x.subject} (${x.status})`, href: '/crm/activities',
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);

    return {
      contact, account, reportsTo, reports, peers,
      opportunities, tenders, quotations, contracts, projects, activities,
      summary, timeline,
    };
  }
}
