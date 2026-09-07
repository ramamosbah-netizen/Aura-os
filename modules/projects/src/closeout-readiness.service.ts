import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assessCloseoutReadiness, type CloseoutReadiness, type ReadinessFacts } from './domain/closeout-readiness';
import type { CloseoutStore } from './closeout-store';
import { CLOSEOUT_STORE } from './closeout-store';
import type { EotStore } from './delay-eot-store';
import { EOT_STORE } from './delay-eot-store';
import type { VariationStore } from './variation-store';
import { VARIATION_STORE } from './variation-store';

/**
 * Ports the owning domains implement. Each is OPTIONAL, and a port that is absent or throws yields
 * `null` — which the rules render as UNKNOWN, never as a pass.
 *
 * They are declared here, by the consumer, and provided at the composition root — the same shape as
 * `ITP_GATE`, so Projects still depends on no other business module.
 */
export interface QualityReadinessPort {
  /** Open non-conformances and snags for a project. */
  readProjectQualityReadiness(tenantId: string, projectId: string): Promise<{ openNcrs: number; criticalOpenNcrs: number; openSnags: number }>;
}
export interface CommissioningReadinessPort {
  readProjectCommissioningReadiness(tenantId: string, projectId: string): Promise<{ systems: number; commissioned: number; openPunchItems: number; criticalOpenPunchItems: number }>;
}
export interface DocumentsReadinessPort {
  readProjectDocumentReadiness(tenantId: string, projectId: string): Promise<{ pendingApprovals: number; asBuiltsApproved: boolean | null }>;
}

export const QUALITY_READINESS = Symbol('QUALITY_READINESS');
export const COMMISSIONING_READINESS = Symbol('COMMISSIONING_READINESS');
export const DOCUMENTS_READINESS = Symbol('DOCUMENTS_READINESS');

/**
 * Assembles the closeout verdict.
 *
 * It reads; it never writes, and it holds no state of its own. Every number comes from the domain
 * that owns it, so this cannot drift from what Quality or Commissioning would say if asked
 * directly — the single-source-of-truth rule the whole Project 360 model rests on.
 *
 * A port that throws is caught and reported as unreadable rather than allowed to fail the request.
 * The distinction matters: a project manager who cannot open the page learns nothing, whereas one
 * who is told "Quality could not be read" knows precisely which system to chase.
 */
@Injectable()
export class CloseoutReadinessService {
  private readonly logger = new Logger('CloseoutReadiness');

  constructor(
    @Inject(CLOSEOUT_STORE) private readonly closeouts: CloseoutStore,
    @Inject(VARIATION_STORE) private readonly variations: VariationStore,
    @Inject(EOT_STORE) private readonly eots: EotStore,
    @Optional() @Inject(QUALITY_READINESS) private readonly quality?: QualityReadinessPort,
    @Optional() @Inject(COMMISSIONING_READINESS) private readonly commissioning?: CommissioningReadinessPort,
    @Optional() @Inject(DOCUMENTS_READINESS) private readonly documents?: DocumentsReadinessPort,
  ) {}

  private async read<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      // Logged, not swallowed: the page will say the domain was unreadable, and the log says why.
      this.logger.warn(`${name} readiness unreadable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async assess(tenantId: string, projectId: string): Promise<CloseoutReadiness> {
    const [quality, commissioning, documents, commercial, checklist] = await Promise.all([
      this.quality ? this.read('quality', () => this.quality!.readProjectQualityReadiness(tenantId, projectId)) : Promise.resolve(null),
      this.commissioning ? this.read('commissioning', () => this.commissioning!.readProjectCommissioningReadiness(tenantId, projectId)) : Promise.resolve(null),
      this.documents ? this.read('documents', () => this.documents!.readProjectDocumentReadiness(tenantId, projectId)) : Promise.resolve(null),
      this.read('commercial', async () => {
        const [vars, eots] = await Promise.all([
          this.variations.list({ tenantId, projectId }),
          this.eots.list({ projectId }),
        ]);
        return {
          submittedVariations: vars.filter((v) => v.status === 'submitted').length,
          draftVariations: vars.filter((v) => v.status === 'draft').length,
          undecidedEotClaims: eots.filter((e) => e.status === 'submitted' || e.status === 'under_review').length,
        };
      }),
      this.read('checklist', async () => {
        const closeout = await this.closeouts.getByProject(tenantId, projectId);
        return closeout
          ? { exists: true, total: closeout.items.length, done: closeout.items.filter((item: { done: boolean }) => item.done).length }
          : { exists: false, total: 0, done: 0 };
      }),
    ]);

    const facts: ReadinessFacts = { projectId, quality, commissioning, documents, commercial, checklist };
    return assessCloseoutReadiness(facts);
  }
}
