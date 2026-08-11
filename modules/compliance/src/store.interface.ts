import type { Page, PageParams } from '@aura/shared';
import type { Authority } from './domain/authority';
import type { ComplianceCase } from './domain/compliance-case';
import type {
  ComplianceCertificate,
  ComplianceDecision,
  ComplianceInspection,
  ComplianceSubmission,
} from './domain/case-records';

export const COMPLIANCE_STORE = Symbol('COMPLIANCE_STORE');

export interface CaseFilter {
  authorityCode?: string;
  scope?: string;
  subjectId?: string;
  projectId?: string;
  status?: string;
}

/**
 * Persistence for the Compliance Core.
 *
 * Every read takes `tenantId` explicitly — there is no bare `get(id)` for N-08 to reopen. This is
 * the shape the ELV device store uses and the reason the module ratchet sits at zero; a kernel
 * store shaped the other way is what the G-20 discovery had to stop and fix first.
 */
export interface ComplianceStore {
  // Authorities — reference data, added by hand until the rules are sourced.
  saveAuthority(a: Authority): Promise<void>;
  findAuthority(id: string, tenantId: string): Promise<Authority | null>;
  findAuthorityByCode(tenantId: string, code: string): Promise<Authority | null>;
  listAuthorities(tenantId: string): Promise<Authority[]>;

  // Cases
  saveCase(c: ComplianceCase): Promise<void>;
  findCase(id: string, tenantId: string): Promise<ComplianceCase | null>;
  listCases(tenantId: string, filter?: CaseFilter): Promise<ComplianceCase[]>;
  listCasesPaged(tenantId: string, page: PageParams, filter?: CaseFilter): Promise<Page<ComplianceCase>>;

  // Append-only children
  addSubmission(s: ComplianceSubmission): Promise<void>;
  listSubmissions(tenantId: string, caseId: string): Promise<ComplianceSubmission[]>;

  saveInspection(i: ComplianceInspection): Promise<void>;
  findInspection(id: string, tenantId: string): Promise<ComplianceInspection | null>;
  listInspections(tenantId: string, caseId: string): Promise<ComplianceInspection[]>;

  addDecision(d: ComplianceDecision): Promise<void>;
  listDecisions(tenantId: string, caseId: string): Promise<ComplianceDecision[]>;

  saveCertificate(c: ComplianceCertificate): Promise<void>;
  listCertificates(tenantId: string, caseId: string): Promise<ComplianceCertificate[]>;
  /** Live certificates (nothing supersedes them) that carry an expiry — the renewal watch-list. */
  listLiveCertificates(tenantId: string): Promise<ComplianceCertificate[]>;
}
