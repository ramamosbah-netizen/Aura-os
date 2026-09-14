import { type Id, newId } from '@aura/shared';

/**
 * The governed engineering basis prepared before estimating. A study belongs to the canonical
 * Pre-Award package; it is versioned independently from the commercial basis so engineering truth
 * can be reviewed without putting rates or margins into the engineer's workspace.
 */
export type TechnicalStudyStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'superseded';
export type StudyRequirementCategory = 'client' | 'authority' | 'technical' | 'site';
export type StudyCompliance = 'unassessed' | 'compliant' | 'partial' | 'deviation' | 'not_applicable';
export type StudyClarificationStatus = 'open' | 'answered' | 'closed';
export type StudyDeviationStatus = 'open' | 'accepted' | 'rejected';

export interface StudySystem {
  id: Id;
  discipline: string;
  name: string;
  designBasis: string;
  interfaces: string[];
}

export interface StudyRequirement {
  id: Id;
  category: StudyRequirementCategory;
  statement: string;
  acceptanceCriteria: string;
  sourceRef: string;
  sourceRequirementId: Id | null;
  compliance: StudyCompliance;
  response: string;
}

export interface StudySurveyFinding {
  id: Id;
  area: string;
  observation: string;
  impact: string;
  evidenceDocumentIds: Id[];
}

export interface StudyClarification {
  id: Id;
  question: string;
  requestedFrom: string;
  dueDate: string | null;
  status: StudyClarificationStatus;
  answer: string;
  reference: string;
}

export interface StudyDeviation {
  id: Id;
  requirementRef: string;
  description: string;
  impact: string;
  proposedResolution: string;
  status: StudyDeviationStatus;
}

export interface StudyEvidenceRef {
  documentId: Id;
  title: string;
  kind: string;
  revision: string;
}

export interface TechnicalStudyContent {
  scopeSummary: string;
  systems: StudySystem[];
  requirements: StudyRequirement[];
  surveyFindings: StudySurveyFinding[];
  clarifications: StudyClarification[];
  deviations: StudyDeviation[];
  assumptions: string[];
  exclusions: string[];
  evidence: StudyEvidenceRef[];
}

export interface TechnicalStudyRevision extends TechnicalStudyContent {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  packageId: Id;
  revisionNo: number;
  parentStudyId: Id | null;
  title: string;
  inputRevision: string;
  status: TechnicalStudyStatus;
  authorId: Id;
  reviewerId: Id;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedBy: Id | null;
  reviewedAt: string | null;
  reviewComment: string | null;
}

export type NewTechnicalStudy = Omit<
  TechnicalStudyRevision,
  'id' | 'revisionNo' | 'parentStudyId' | 'status' | 'createdAt' | 'updatedAt' |
  'submittedAt' | 'reviewedBy' | 'reviewedAt' | 'reviewComment'
>;

const nonBlank = (value: string, field: string): string => {
  const result = value?.trim();
  if (!result) throw new Error(`${field} is required`);
  return result;
};

const strings = (values: string[] | undefined): string[] =>
  (values ?? []).map((value) => value.trim()).filter(Boolean);

const content = (input: TechnicalStudyContent): TechnicalStudyContent => ({
  scopeSummary: input.scopeSummary?.trim() ?? '',
  systems: (input.systems ?? []).map((system) => ({
    id: system.id || newId(),
    discipline: nonBlank(system.discipline, 'system discipline'),
    name: nonBlank(system.name, 'system name'),
    designBasis: system.designBasis?.trim() ?? '',
    interfaces: strings(system.interfaces),
  })),
  requirements: (input.requirements ?? []).map((requirement) => ({
    id: requirement.id || newId(),
    category: requirement.category,
    statement: nonBlank(requirement.statement, 'requirement statement'),
    acceptanceCriteria: requirement.acceptanceCriteria?.trim() ?? '',
    sourceRef: requirement.sourceRef?.trim() ?? '',
    sourceRequirementId: requirement.sourceRequirementId ?? null,
    compliance: requirement.compliance ?? 'unassessed',
    response: requirement.response?.trim() ?? '',
  })),
  surveyFindings: (input.surveyFindings ?? []).map((finding) => ({
    id: finding.id || newId(),
    area: nonBlank(finding.area, 'survey area'),
    observation: nonBlank(finding.observation, 'survey observation'),
    impact: finding.impact?.trim() ?? '',
    evidenceDocumentIds: [...new Set(finding.evidenceDocumentIds ?? [])],
  })),
  clarifications: (input.clarifications ?? []).map((clarification) => ({
    id: clarification.id || newId(),
    question: nonBlank(clarification.question, 'clarification question'),
    requestedFrom: clarification.requestedFrom?.trim() ?? '',
    dueDate: clarification.dueDate ?? null,
    status: clarification.status ?? 'open',
    answer: clarification.answer?.trim() ?? '',
    reference: clarification.reference?.trim() ?? '',
  })),
  deviations: (input.deviations ?? []).map((deviation) => ({
    id: deviation.id || newId(),
    requirementRef: deviation.requirementRef?.trim() ?? '',
    description: nonBlank(deviation.description, 'deviation description'),
    impact: deviation.impact?.trim() ?? '',
    proposedResolution: deviation.proposedResolution?.trim() ?? '',
    status: deviation.status ?? 'open',
  })),
  assumptions: strings(input.assumptions),
  exclusions: strings(input.exclusions),
  evidence: (input.evidence ?? []).map((item) => ({
    documentId: nonBlank(item.documentId, 'evidence documentId'),
    title: nonBlank(item.title, 'evidence title'),
    kind: nonBlank(item.kind, 'evidence kind'),
    revision: item.revision?.trim() ?? '',
  })),
});

export function makeTechnicalStudy(
  input: NewTechnicalStudy,
  revisionNo: number,
  parentStudyId: Id | null = null,
): TechnicalStudyRevision {
  if (!Number.isInteger(revisionNo) || revisionNo < 1) throw new Error('revisionNo must be a positive integer');
  if (input.authorId === input.reviewerId) throw new Error('study author and reviewer must be different users');
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    packageId: input.packageId,
    revisionNo,
    parentStudyId,
    title: nonBlank(input.title, 'study title'),
    inputRevision: nonBlank(input.inputRevision, 'input revision'),
    status: 'draft',
    authorId: input.authorId,
    reviewerId: input.reviewerId,
    ...content(input),
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
  };
}

export function updateTechnicalStudy(
  study: TechnicalStudyRevision,
  patch: Partial<Pick<TechnicalStudyRevision, 'title' | 'inputRevision' | 'reviewerId'>> & Partial<TechnicalStudyContent>,
  actorId: Id,
  expectedUpdatedAt: string,
): TechnicalStudyRevision {
  if (study.status !== 'draft' && study.status !== 'changes_requested') throw new Error(`study revision is ${study.status} and cannot be edited`);
  if (study.authorId !== actorId) throw new Error('only the assigned study author can edit this revision');
  if (study.updatedAt !== expectedUpdatedAt) throw new Error('study changed since it was opened — reload before saving');
  const reviewerId = patch.reviewerId ?? study.reviewerId;
  if (reviewerId === study.authorId) throw new Error('study author and reviewer must be different users');
  const nextContent = content({
    scopeSummary: patch.scopeSummary ?? study.scopeSummary,
    systems: patch.systems ?? study.systems,
    requirements: patch.requirements ?? study.requirements,
    surveyFindings: patch.surveyFindings ?? study.surveyFindings,
    clarifications: patch.clarifications ?? study.clarifications,
    deviations: patch.deviations ?? study.deviations,
    assumptions: patch.assumptions ?? study.assumptions,
    exclusions: patch.exclusions ?? study.exclusions,
    evidence: patch.evidence ?? study.evidence,
  });
  return {
    ...study,
    ...nextContent,
    title: patch.title === undefined ? study.title : nonBlank(patch.title, 'study title'),
    inputRevision: patch.inputRevision === undefined ? study.inputRevision : nonBlank(patch.inputRevision, 'input revision'),
    reviewerId,
    updatedAt: new Date().toISOString(),
  };
}

export interface TechnicalStudyReadiness {
  ready: boolean;
  blockers: string[];
}

export function technicalStudyReadiness(study: TechnicalStudyRevision): TechnicalStudyReadiness {
  const blockers: string[] = [];
  if (!study.scopeSummary.trim()) blockers.push('Scope summary is missing');
  if (study.systems.length === 0) blockers.push('At least one ELV/MEP system must be identified');
  if (study.requirements.length === 0) blockers.push('At least one requirement must be assessed');
  const unassessed = study.requirements.filter((item) => item.compliance === 'unassessed').length;
  if (unassessed) blockers.push(`${unassessed} requirement(s) are not assessed`);
  const openClarifications = study.clarifications.filter((item) => item.status === 'open').length;
  if (openClarifications) blockers.push(`${openClarifications} clarification(s) remain open`);
  const openDeviations = study.deviations.filter((item) => item.status === 'open').length;
  if (openDeviations) blockers.push(`${openDeviations} deviation(s) have no disposition`);
  return { ready: blockers.length === 0, blockers };
}

export function submitTechnicalStudy(study: TechnicalStudyRevision, actorId: Id): TechnicalStudyRevision {
  if (study.status !== 'draft' && study.status !== 'changes_requested') throw new Error(`study revision is ${study.status} and cannot be submitted`);
  if (study.authorId !== actorId) throw new Error('only the assigned study author can submit this revision');
  const now = new Date().toISOString();
  return { ...study, status: 'in_review', submittedAt: now, updatedAt: now, reviewComment: null };
}

export function approveTechnicalStudy(study: TechnicalStudyRevision, actorId: Id, comment?: string | null): TechnicalStudyRevision {
  if (study.status !== 'in_review') throw new Error(`only a study in review can be approved (is ${study.status})`);
  if (study.authorId === actorId) throw new Error('the study author cannot approve their own work');
  if (study.reviewerId !== actorId) throw new Error('only the assigned reviewer can approve this study');
  const readiness = technicalStudyReadiness(study);
  if (!readiness.ready) throw new Error(`study is not approval-ready: ${readiness.blockers.join('; ')}`);
  const now = new Date().toISOString();
  return { ...study, status: 'approved', reviewedBy: actorId, reviewedAt: now, reviewComment: comment?.trim() || null, updatedAt: now };
}

export function requestTechnicalStudyChanges(study: TechnicalStudyRevision, actorId: Id, comment: string): TechnicalStudyRevision {
  if (study.status !== 'in_review') throw new Error(`only a study in review can be returned (is ${study.status})`);
  if (study.authorId === actorId) throw new Error('the study author cannot review their own work');
  if (study.reviewerId !== actorId) throw new Error('only the assigned reviewer can review this study');
  const now = new Date().toISOString();
  return { ...study, status: 'changes_requested', reviewedBy: actorId, reviewedAt: now, reviewComment: nonBlank(comment, 'review comment'), updatedAt: now };
}

export function supersedeTechnicalStudy(study: TechnicalStudyRevision): TechnicalStudyRevision {
  if (study.status !== 'approved') throw new Error('only an approved study can be superseded by a new revision');
  return { ...study, status: 'superseded', updatedAt: new Date().toISOString() };
}

