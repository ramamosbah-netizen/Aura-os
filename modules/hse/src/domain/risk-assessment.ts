import { randomUUID } from 'node:crypto';

/**
 * Risk Assessment (JSA) — a controlled hazard assessment for an activity. Each hazard is
 * scored likelihood × severity (1–5 each) → a 1–25 risk score, banded low/medium/high/critical.
 * The assessment carries the highest residual band across its hazards.
 */
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';
export type RiskAssessmentStatus = 'draft' | 'approved' | 'expired';

export interface RiskLine {
  hazard: string;
  likelihood: number; // 1–5
  severity: number;   // 1–5
  controls: string;
  /** Residual likelihood/severity after controls. */
  residualLikelihood: number;
  residualSeverity: number;
}

export interface RiskAssessment {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  reference: string;
  activity: string;
  assessor: string | null;
  hazards: RiskLine[];
  /** Highest initial score (likelihood×severity) across hazards, 1–25. */
  initialScore: number;
  /** Highest residual score across hazards, 1–25. */
  residualScore: number;
  residualBand: RiskBand;
  status: RiskAssessmentStatus;
  reviewDate: string | null;
  /**
   * WHO APPROVED IT, and when. A permit to work cannot be approved until its risk assessment is
   * approved, so this is the signature the whole permit gate rests on — and `approveRiskAssessment`
   * took no actor at all, recorded nothing, and let the assessor approve their own work.
   */
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewRiskAssessment {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reference: string;
  activity: string;
  assessor?: string | null;
  hazards: RiskLine[];
  status?: RiskAssessmentStatus;
  reviewDate?: string | null;
  createdBy?: string | null;
}

const clamp = (n: number): number => Math.max(1, Math.min(5, Math.round(Number(n) || 1)));

export function riskBand(score: number): RiskBand {
  if (score >= 15) return 'critical';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

export function makeRiskAssessment(input: NewRiskAssessment): RiskAssessment {
  const now = new Date().toISOString();
  const hazards: RiskLine[] = (input.hazards ?? []).map((h) => ({
    hazard: h.hazard.trim(),
    likelihood: clamp(h.likelihood),
    severity: clamp(h.severity),
    controls: (h.controls ?? '').trim(),
    residualLikelihood: clamp(h.residualLikelihood ?? h.likelihood),
    residualSeverity: clamp(h.residualSeverity ?? h.severity),
  }));
  const initialScore = hazards.reduce((max, h) => Math.max(max, h.likelihood * h.severity), 0);
  const residualScore = hazards.reduce((max, h) => Math.max(max, h.residualLikelihood * h.residualSeverity), 0);
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reference: input.reference.trim(),
    activity: input.activity.trim(),
    assessor: input.assessor?.trim() || null,
    hazards,
    initialScore,
    residualScore,
    residualBand: riskBand(residualScore),
    status: input.status ?? 'draft',
    reviewDate: input.reviewDate ?? null,
    approvedBy: null,
    approvedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * APPROVE the assessment — the act that lets a permit to work be approved at all.
 *
 * THE ASSESSOR MAY NOT APPROVE THEIR OWN. The permit this authorises already refuses its requester
 * their own approval, in a record that holds `requestedBy` separately from `createdBy` so the check
 * is possible; the document underneath had neither the rule nor anywhere to put the answer. A chain
 * of controls is as strong as its weakest link, and this was the weakest by a distance.
 *
 * Where the assessment has no recorded author — written before authorship existed — the approval
 * proceeds and says the check could not run, rather than blocking safety-critical work over a fact
 * nobody wrote down at the time.
 */
export function approveRiskAssessment(ra: RiskAssessment, approvedBy: string | null = null): RiskAssessment {
  if (ra.status === 'approved') throw new Error('this risk assessment is already approved');
  if (approvedBy && ra.createdBy && approvedBy === ra.createdBy) {
    throw new Error(
      'the person who wrote this risk assessment may not approve their own — it is what authorises a permit to work',
    );
  }
  return {
    ...ra,
    status: 'approved',
    approvedBy,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Was the assessor/approver separation actually CHECKED? Derived, never stored twice. */
export function assessmentSeparation(ra: RiskAssessment): 'enforced' | 'unverifiable' | null {
  if (ra.approvedAt === null) return null;
  return ra.createdBy ? 'enforced' : 'unverifiable';
}
