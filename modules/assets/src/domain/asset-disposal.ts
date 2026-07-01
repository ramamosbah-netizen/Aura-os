import { randomUUID } from 'node:crypto';

// Assets domain — framework-free. A Disposal record retires an asset (sale, scrap, write-off,
// trade-in) and books the gain/loss vs its net book value at disposal, so Finance can post
// the disposal to the GL. Retiring an asset sets its status to 'disposed'.

export type DisposalMethod = 'sale' | 'scrap' | 'write_off' | 'trade_in' | 'donation';

export interface AssetDisposal {
  id: string;
  tenantId: string;
  companyId: string | null;
  assetId: string;
  assetName: string | null;
  disposalDate: string; // YYYY-MM-DD
  method: DisposalMethod;
  proceeds: number;       // amount received (0 for scrap/write-off)
  bookValue: number;      // net book value at disposal
  gainLoss: number;       // proceeds − bookValue (positive = gain)
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface NewAssetDisposal {
  tenantId: string;
  companyId?: string | null;
  assetId: string;
  assetName?: string | null;
  disposalDate: string;
  method: DisposalMethod;
  proceeds?: number;
  bookValue?: number;
  notes?: string | null;
  createdBy?: string | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function makeAssetDisposal(input: NewAssetDisposal): AssetDisposal {
  const proceeds = r2(Number(input.proceeds) || 0);
  const bookValue = r2(Number(input.bookValue) || 0);
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    assetId: input.assetId,
    assetName: input.assetName?.trim() || null,
    disposalDate: input.disposalDate.slice(0, 10),
    method: input.method,
    proceeds,
    bookValue,
    gainLoss: r2(proceeds - bookValue),
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export const ASSET_DISPOSAL_EVENT = {
  disposed: 'assets.asset.disposed',
} as const;
