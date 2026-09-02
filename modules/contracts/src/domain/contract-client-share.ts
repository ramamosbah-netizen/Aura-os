import { type Id, newId } from '@aura/shared';

export type ClientShareMethod = 'download' | 'email' | 'link';
export type ClientShareState = 'prepared' | 'dispatched' | 'delivered' | 'failed';

export interface ContractClientShare {
  id: Id; tenantId: Id; contractId: Id; revisionId: Id; recipient: string;
  method: ClientShareMethod; state: ClientShareState; sharedBy: Id | null;
  sharedAt: string; correlationId: string; failureReason: string | null;
}

export interface NewContractClientShare { tenantId: Id; contractId: Id; revisionId: Id; recipient: string; method: ClientShareMethod; sharedBy?: Id | null; correlationId?: string; }

export function makeContractClientShare(input: NewContractClientShare): ContractClientShare {
  const recipient = input.recipient.trim();
  if (!recipient) throw new Error('recipient is required');
  if (!['download', 'email', 'link'].includes(input.method)) throw new Error('invalid client share method');
  return { id:newId(), tenantId:input.tenantId, contractId:input.contractId, revisionId:input.revisionId, recipient,
    method:input.method, state:'prepared', sharedBy:input.sharedBy ?? null, sharedAt:new Date().toISOString(),
    correlationId:input.correlationId?.trim() || newId(), failureReason:null };
}

export function dispatchClientShare(share: ContractClientShare): ContractClientShare {
  if (share.state !== 'prepared') throw new Error('client share is not prepared');
  return { ...share, state:'dispatched' };
}

