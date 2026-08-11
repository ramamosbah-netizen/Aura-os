import { type Page, type PageParams, makePage } from '@aura/shared';
import type { CaseFilter, ComplianceStore } from './store.interface';
import type { Authority } from './domain/authority';
import type { ComplianceCase } from './domain/compliance-case';
import type {
  ComplianceCertificate,
  ComplianceDecision,
  ComplianceInspection,
  ComplianceSubmission,
} from './domain/case-records';

/** Dev/test adapter — in-memory, non-persistent. Mirrors the Postgres adapter's ordering. */
export class InMemoryComplianceStore implements ComplianceStore {
  private readonly authorities = new Map<string, Authority>();
  private readonly cases = new Map<string, ComplianceCase>();
  private readonly submissions: ComplianceSubmission[] = [];
  private readonly inspections = new Map<string, ComplianceInspection>();
  private readonly decisions: ComplianceDecision[] = [];
  private readonly certificates = new Map<string, ComplianceCertificate>();

  // ── Authorities ──────────────────────────────────────────────────────────────
  async saveAuthority(a: Authority): Promise<void> {
    this.authorities.set(a.id, { ...a });
  }

  async findAuthority(id: string, tenantId: string): Promise<Authority | null> {
    const a = this.authorities.get(id);
    return a && a.tenantId === tenantId ? { ...a } : null;
  }

  async findAuthorityByCode(tenantId: string, code: string): Promise<Authority | null> {
    const wanted = code.trim().toUpperCase();
    const hit = [...this.authorities.values()].find((a) => a.tenantId === tenantId && a.code === wanted);
    return hit ? { ...hit } : null;
  }

  async listAuthorities(tenantId: string): Promise<Authority[]> {
    return [...this.authorities.values()]
      .filter((a) => a.tenantId === tenantId)
      .sort((x, y) => x.code.localeCompare(y.code));
  }

  // ── Cases ────────────────────────────────────────────────────────────────────
  async saveCase(c: ComplianceCase): Promise<void> {
    this.cases.set(c.id, { ...c, deviceIds: [...c.deviceIds] });
  }

  async findCase(id: string, tenantId: string): Promise<ComplianceCase | null> {
    const c = this.cases.get(id);
    return c && c.tenantId === tenantId ? { ...c, deviceIds: [...c.deviceIds] } : null;
  }

  async listCases(tenantId: string, filter?: CaseFilter): Promise<ComplianceCase[]> {
    return [...this.cases.values()]
      .filter(
        (c) =>
          c.tenantId === tenantId &&
          (!filter?.authorityCode || c.authorityCode === filter.authorityCode.toUpperCase()) &&
          (!filter?.scope || c.scope === filter.scope) &&
          (!filter?.subjectId || c.subjectId === filter.subjectId) &&
          (!filter?.projectId || c.projectId === filter.projectId) &&
          (!filter?.status || c.status === filter.status),
      )
      .map((c) => ({ ...c, deviceIds: [...c.deviceIds] }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listCasesPaged(tenantId: string, page: PageParams, filter?: CaseFilter): Promise<Page<ComplianceCase>> {
    const all = await this.listCases(tenantId, filter);
    return makePage(all.slice(page.offset, page.offset + page.limit), all.length, page);
  }

  // ── Append-only children ─────────────────────────────────────────────────────
  async addSubmission(s: ComplianceSubmission): Promise<void> {
    this.submissions.push({ ...s });
  }

  async listSubmissions(tenantId: string, caseId: string): Promise<ComplianceSubmission[]> {
    return this.submissions
      .filter((s) => s.tenantId === tenantId && s.caseId === caseId)
      .sort((a, b) => a.attempt - b.attempt);
  }

  async saveInspection(i: ComplianceInspection): Promise<void> {
    this.inspections.set(i.id, { ...i });
  }

  async findInspection(id: string, tenantId: string): Promise<ComplianceInspection | null> {
    const i = this.inspections.get(id);
    return i && i.tenantId === tenantId ? { ...i } : null;
  }

  async listInspections(tenantId: string, caseId: string): Promise<ComplianceInspection[]> {
    return [...this.inspections.values()].filter((i) => i.tenantId === tenantId && i.caseId === caseId);
  }

  async addDecision(d: ComplianceDecision): Promise<void> {
    this.decisions.push({ ...d });
  }

  async listDecisions(tenantId: string, caseId: string): Promise<ComplianceDecision[]> {
    // Oldest first: the sequence is the point — a rejection followed by an approval.
    return this.decisions
      .filter((d) => d.tenantId === tenantId && d.caseId === caseId)
      .sort((a, b) => (a.decisionDate < b.decisionDate ? -1 : 1));
  }

  async saveCertificate(c: ComplianceCertificate): Promise<void> {
    this.certificates.set(c.id, { ...c });
  }

  async listCertificates(tenantId: string, caseId: string): Promise<ComplianceCertificate[]> {
    return [...this.certificates.values()]
      .filter((c) => c.tenantId === tenantId && c.caseId === caseId)
      .sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));
  }

  async listLiveCertificates(tenantId: string): Promise<ComplianceCertificate[]> {
    return [...this.certificates.values()]
      .filter((c) => c.tenantId === tenantId && !c.supersededByCertificateId && c.expiresAt)
      .sort((a, b) => (a.expiresAt! < b.expiresAt! ? -1 : 1));
  }
}
