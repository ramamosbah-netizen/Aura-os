import { type Id, newId } from '@aura/shared';

export type NegotiationItemType = 'comment' | 'change_request';
export type NegotiationVisibility = 'internal' | 'client_visible';
export type NegotiationItemStatus = 'open' | 'resolved' | 'rejected';

export interface ContractNegotiationItem {
  id: Id;
  tenantId: Id;
  contractId: Id;
  revisionId: Id;
  type: NegotiationItemType;
  content: string;
  visibility: NegotiationVisibility;
  status: NegotiationItemStatus;
  ownerId: Id | null;
  resolution: string | null;
  createdBy: Id | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface NewContractNegotiationItem {
  tenantId: Id;
  contractId: Id;
  revisionId: Id;
  type: NegotiationItemType;
  content: string;
  visibility?: NegotiationVisibility;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeContractNegotiationItem(input: NewContractNegotiationItem): ContractNegotiationItem {
  const content = input.content.trim();
  if (!content) throw new Error('negotiation content is required');
  if (!['comment', 'change_request'].includes(input.type)) throw new Error('invalid negotiation item type');
  const now = new Date().toISOString();
  return {
    id: newId(), tenantId: input.tenantId, contractId: input.contractId, revisionId: input.revisionId,
    type: input.type, content, visibility: input.visibility ?? 'internal', status: 'open',
    ownerId: input.ownerId ?? null, resolution: null, createdBy: input.createdBy ?? null,
    createdAt: now, resolvedAt: null,
  };
}

export function resolveNegotiationItem(item: ContractNegotiationItem, status: 'resolved' | 'rejected', resolution: string): ContractNegotiationItem {
  const text = resolution.trim();
  if (!text) throw new Error('resolution is required');
  if (item.status !== 'open') throw new Error('negotiation item is already closed');
  return { ...item, status, resolution: text, resolvedAt: new Date().toISOString() };
}

