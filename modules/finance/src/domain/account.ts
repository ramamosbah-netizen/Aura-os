import { type Id, newId } from '@aura/shared';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: Id;
  tenantId: Id;
  code: string;
  name: string;
  type: AccountType;
  parentId: Id | null;
  createdAt: string;
}

export interface NewAccount {
  tenantId: Id;
  code: string;
  name: string;
  type: AccountType;
  parentId?: Id | null;
}

export function makeAccount(input: NewAccount): Account {
  return {
    id: newId(),
    tenantId: input.tenantId,
    code: input.code.trim(),
    name: input.name.trim(),
    type: input.type,
    parentId: input.parentId ?? null,
    createdAt: new Date().toISOString(),
  };
}
