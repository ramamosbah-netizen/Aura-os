import { randomUUID } from 'node:crypto';

export interface SafetyTrainingRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  workerName: string;
  workerId: string;
  inductionDate: string; // YYYY-MM-DD
  cardNumber: string | null;
  cardExpiry: string | null; // YYYY-MM-DD
  certifications: string[]; // e.g. ["Work at Height", "First Aid"]
  status: 'valid' | 'expired';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSafetyTrainingRecord {
  tenantId: string;
  companyId?: string | null;
  workerName: string;
  workerId: string;
  inductionDate: string;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  certifications?: string[];
  createdBy?: string | null;
}

export function makeSafetyTrainingRecord(input: NewSafetyTrainingRecord): SafetyTrainingRecord {
  if (!input.workerName?.trim()) throw new Error('workerName is required');
  if (!input.workerId?.trim()) throw new Error('workerId is required');
  if (!input.inductionDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.inductionDate)) throw new Error('inductionDate must be YYYY-MM-DD');

  let status: 'valid' | 'expired' = 'valid';
  if (input.cardExpiry) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cardExpiry)) throw new Error('cardExpiry must be YYYY-MM-DD');
    const today = new Date().toISOString().split('T')[0];
    if (input.cardExpiry < today) {
      status = 'expired';
    }
  }

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    workerName: input.workerName.trim(),
    workerId: input.workerId.trim(),
    inductionDate: input.inductionDate,
    cardNumber: input.cardNumber?.trim() || null,
    cardExpiry: input.cardExpiry || null,
    certifications: input.certifications || [],
    status,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export const SAFETY_TRAINING_EVENT = {
  recorded: 'hse.safety_training.recorded',
} as const;
