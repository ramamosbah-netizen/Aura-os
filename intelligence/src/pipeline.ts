import type { DomainEvent } from '@aura/shared';

// Framework-free deal-chain projection logic. The intelligence layer OBSERVES the spine
// and derives a funnel read-model — it never reads or writes a business module's tables.

/** The deal-chain stages we project, keyed by their spine event type. */
export const DEAL_CHAIN_EVENT_TYPES = {
  'crm.account.created': 'account',
  'tendering.tender.created': 'tender',
  'contracts.contract.created': 'contract',
  'projects.project.created': 'project',
} as const;

export function isDealChainEvent(type: string): boolean {
  return type in DEAL_CHAIN_EVENT_TYPES;
}

export interface Funnel {
  accounts: number;
  tenders: number;
  contracts: number;
  projects: number;
  tenderValue: number;
  contractValue: number;
  projectValue: number;
}

export function emptyFunnel(): Funnel {
  return { accounts: 0, tenders: 0, contracts: 0, projects: 0, tenderValue: 0, contractValue: 0, projectValue: 0 };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Pure fold of one event into a funnel (returns a new funnel). Non-chain types pass through. */
export function foldEvent(f: Funnel, e: DomainEvent): Funnel {
  const value = num((e.payload as { value?: unknown }).value);
  switch (e.type) {
    case 'crm.account.created':
      return { ...f, accounts: f.accounts + 1 };
    case 'tendering.tender.created':
      return { ...f, tenders: f.tenders + 1, tenderValue: f.tenderValue + value };
    case 'contracts.contract.created':
      return { ...f, contracts: f.contracts + 1, contractValue: f.contractValue + value };
    case 'projects.project.created':
      return { ...f, projects: f.projects + 1, projectValue: f.projectValue + value };
    default:
      return f;
  }
}

export function foldPipeline(events: DomainEvent[]): Funnel {
  return events.reduce(foldEvent, emptyFunnel());
}

/** Conversion proxy: contracts awarded per tender raised (0..1), or null with no tenders. */
export function winRate(f: Funnel): number | null {
  return f.tenders > 0 ? f.contracts / f.tenders : null;
}
