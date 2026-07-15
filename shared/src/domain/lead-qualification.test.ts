import { describe, it, expect } from 'vitest';
import {
  assessLeadQualification,
  leadQualificationConfidence,
  normalizeLeadQualification,
  recommendLeadQualification,
  scoreLeadQualification,
  LEAD_QUALIFICATION_DIMENSIONS,
} from './lead-qualification';

describe('scoreLeadQualification', () => {
  it('averages only the rated dimensions — unrated is unknown, NOT zero', () => {
    // The trap this guards: treating unrated as 0 would score a strong-but-half-assessed lead at
    // 25 and push people to rate everything blindly rather than as they learn.
    expect(scoreLeadQualification({ fit: 100, intent: 100 })).toBe(100);
    expect(scoreLeadQualification({ fit: 80, intent: 60 })).toBe(70);
  });

  it('is 0 when nothing is rated (and confidence says why)', () => {
    expect(scoreLeadQualification({})).toBe(0);
    expect(leadQualificationConfidence({})).toBe('LOW');
  });

  it('clamps out-of-range input rather than letting it skew the average', () => {
    expect(scoreLeadQualification({ fit: 500, intent: -50 })).toBe(50); // 100 and 0
  });
});

describe('leadQualificationConfidence', () => {
  it('rises with coverage, so a score from one dimension is never shown as a score from eight', () => {
    expect(leadQualificationConfidence({ fit: 90 })).toBe('LOW');
    expect(leadQualificationConfidence({ fit: 90, intent: 80, needConfidence: 70 })).toBe('MEDIUM');
    expect(
      leadQualificationConfidence({ fit: 9, intent: 8, needConfidence: 7, timingReadiness: 6, authorityAccess: 5, commercialPotential: 4 }),
    ).toBe('HIGH');
  });
});

describe('recommendLeadQualification', () => {
  it('refuses a verdict it has not earned — LOW coverage always REVIEW', () => {
    expect(recommendLeadQualification(95, 'LOW')).toBe('REVIEW');
    expect(recommendLeadQualification(5, 'LOW')).toBe('REVIEW');
  });

  it('maps score to the three real lead exits once coverage is sufficient', () => {
    expect(recommendLeadQualification(60, 'HIGH')).toBe('QUALIFY');
    expect(recommendLeadQualification(59, 'HIGH')).toBe('NURTURE');
    expect(recommendLeadQualification(35, 'MEDIUM')).toBe('NURTURE');
    expect(recommendLeadQualification(34, 'MEDIUM')).toBe('DISQUALIFY');
  });
});

describe('assessLeadQualification', () => {
  it('explains itself — strengths and gaps by name, never a bare number', () => {
    const a = assessLeadQualification({
      fit: 90, intent: 85, needConfidence: 80, timingReadiness: 75,
      authorityAccess: 20, commercialPotential: 90, relationshipStrength: 80,
      // informationQuality deliberately unrated
    });
    expect(a.score).toBe(74);
    expect(a.confidence).toBe('HIGH');
    expect(a.coverage).toEqual({ rated: 7, total: 8 });
    expect(a.recommendation).toBe('QUALIFY');
    expect(a.strengths.map((s) => s.key)).toContain('fit');
    // A weak dimension is a gap...
    expect(a.gaps.map((g) => g.key)).toContain('authorityAccess');
    // ...and so is an unrated one: "we have not asked" is work to do, not neutral absence.
    const unrated = a.gaps.find((g) => g.key === 'informationQuality');
    expect(unrated?.value).toBeNull();
  });

  it('an unassessed lead is REVIEW with every dimension listed as a gap', () => {
    const a = assessLeadQualification();
    expect(a.recommendation).toBe('REVIEW');
    expect(a.gaps).toHaveLength(LEAD_QUALIFICATION_DIMENSIONS.length);
    expect(a.strengths).toHaveLength(0);
  });

  it('a genuinely poor lead is DISQUALIFY, with the reasons attached', () => {
    const a = assessLeadQualification({ fit: 10, intent: 15, needConfidence: 20, timingReadiness: 10 });
    expect(a.recommendation).toBe('DISQUALIFY');
    expect(a.gaps.map((g) => g.key)).toContain('fit');
  });
});

describe('normalizeLeadQualification', () => {
  it('drops unknown keys and junk so nothing arbitrary reaches the jsonb column', () => {
    expect(normalizeLeadQualification({ fit: 80, winProbability: 90, nonsense: 'x' })).toEqual({ fit: 80 });
    expect(normalizeLeadQualification(null)).toEqual({});
    expect(normalizeLeadQualification('nope')).toEqual({});
  });

  it('clamps and rounds', () => {
    expect(normalizeLeadQualification({ fit: 88.6, intent: 120, needConfidence: -5 })).toEqual({ fit: 89, intent: 100, needConfidence: 0 });
  });
});
