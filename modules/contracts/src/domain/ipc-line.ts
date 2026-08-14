import { type Id, newId, mulMoney } from '@aura/shared';

// A valuation line on an Interim Payment Certificate (IPC). A remeasurement IPC certifies work per
// BOQ (measured) item — quantity × rate — so the client is billed for measured progress. Each line
// carries the BOQ item + certified quantity; on certification the Quantity Ledger accrues that
// quantity as the item's INVOICED position (the last link in the delivery chain). Value stays on the
// certificate header (netThisCertificate); the line's `amount` is the gross measure for the drill-down.

export interface IpcLine {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  certificateId: Id;
  /** The project the certificate's contract runs — carried so the Quantity Ledger post needs no join. */
  projectId: Id;
  /** The BOQ (measured) item this line certifies — the Quantity Ledger key. */
  boqItemId: Id;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  /** Gross measure for this line: quantity × rate. */
  amount: number;
  createdAt: string;
}

export interface NewIpcLine {
  tenantId: Id;
  companyId?: Id | null;
  certificateId: Id;
  projectId: Id;
  boqItemId: Id;
  description: string;
  quantity: number;
  unit?: string | null;
  rate?: number;
}

export function makeIpcLine(input: NewIpcLine): IpcLine {
  if (!input.certificateId) throw new Error('certificateId is required');
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.boqItemId) throw new Error('boqItemId is required');
  if (!input.description || !input.description.trim()) throw new Error('description is required');
  const quantity = Number(input.quantity) || 0;
  if (quantity <= 0) throw new Error('certified quantity must be positive');
  const rate = Math.max(0, Number(input.rate) || 0);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    certificateId: input.certificateId,
    projectId: input.projectId,
    boqItemId: input.boqItemId,
    description: input.description.trim(),
    quantity,
    unit: input.unit?.trim() || 'nr',
    rate,
    amount: Number(mulMoney(quantity, rate)),
    createdAt: new Date().toISOString(),
  };
}
