import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Id, Signal } from '@aura/shared';
import {
  FINDING_SIGNAL_TYPE,
  deriveGrowthFindings, makeInstalledBaseItem, systemCoverage,
  type GrowthFinding, type InstalledBaseItem, type NewInstalledBaseItem, type SystemCoverage,
} from './domain/installed-base';
import { CRM_INSTALLED_BASE_STORE, type InstalledBaseStore } from './installed-base-store';
import { CRM_ACCOUNT_STORE, type AccountStore } from './account-store';
import { SignalService } from './signal.service';

export interface InstalledBaseView {
  items: InstalledBaseItem[];
  coverage: SystemCoverage[];
  findings: GrowthFinding[];
}

export interface GrowthScanResult {
  findings: GrowthFinding[];
  /** Signals actually raised this scan (dedupeKey made re-scans return existing ones). */
  raised: number;
  signals: Signal[];
}

/**
 * §26 — the installed base and its derived white-space. CRUD over what the customer HAS,
 * plus the growth scan: findings become deduplicated SIGNALS on the S3 radar — never
 * auto-created opportunities. A human promotes what's real.
 */
@Injectable()
export class InstalledBaseService {
  private readonly logger = new Logger('CRM-InstalledBase');

  constructor(
    @Inject(CRM_INSTALLED_BASE_STORE) private readonly store: InstalledBaseStore,
    @Inject(CRM_ACCOUNT_STORE) private readonly accounts: AccountStore,
    private readonly signals: SignalService,
  ) {}

  private async assertAccount(tenantId: Id, accountId: Id): Promise<{ id: Id; name: string }> {
    const account = await this.accounts.get(accountId);
    if (!account || account.tenantId !== tenantId) throw new Error(`account ${accountId} not found`);
    return { id: account.id, name: account.name };
  }

  async add(input: NewInstalledBaseItem): Promise<InstalledBaseItem> {
    await this.assertAccount(input.tenantId, input.accountId);
    const item = makeInstalledBaseItem(input);
    await this.store.create(item);
    this.logger.log(`Installed base: +${item.system} (${item.provider}) on account ${item.accountId}`);
    return item;
  }

  async patch(id: Id, tenantId: Id, patch: Partial<Pick<InstalledBaseItem, 'system' | 'siteName' | 'provider' | 'competitorName' | 'installedAt' | 'warrantyExpiresAt' | 'amcStatus' | 'amcExpiresAt' | 'projectId' | 'notes'>>): Promise<InstalledBaseItem> {
    const existing = await this.store.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error(`installed base item ${id} not found`);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: InstalledBaseItem = { ...existing, ...defined };
    await this.store.update(updated);
    return updated;
  }

  async remove(id: Id, tenantId: Id): Promise<void> {
    const existing = await this.store.get(id);
    if (!existing || existing.tenantId !== tenantId) throw new Error(`installed base item ${id} not found`);
    await this.store.delete(id);
  }

  /** The register + the derived white-space board + the current findings, in one read. */
  async viewFor(tenantId: Id, accountId: Id): Promise<InstalledBaseView> {
    await this.assertAccount(tenantId, accountId);
    const items = await this.store.listFor(tenantId, accountId);
    return { items, coverage: systemCoverage(items), findings: deriveGrowthFindings(accountId, items) };
  }

  /**
   * The growth scan: derive findings and raise each as a Signal on the radar. Idempotent —
   * detect() dedupes on the finding's stable key, so scanning twice raises nothing new until
   * the facts change (a new expiry date is a new fact and a new key).
   */
  async scan(tenantId: Id, accountId: Id, actorId?: Id | null): Promise<GrowthScanResult> {
    const account = await this.assertAccount(tenantId, accountId);
    const items = await this.store.listFor(tenantId, accountId);
    const findings = deriveGrowthFindings(accountId, items);

    const signals: Signal[] = [];
    let raised = 0;
    const scanStart = new Date().toISOString();
    for (const f of findings) {
      // create() is idempotent on dedupeKey (S3 growth-reactor invariant) — a re-scan gets the
      // live signal back instead of stacking duplicates.
      const signal = await this.signals.create({
        tenantId,
        title: `${account.name}: ${f.reason}`,
        source: 'ACCOUNT_GROWTH',
        type: FINDING_SIGNAL_TYPE[f.kind],
        accountId: account.id,
        accountName: account.name,
        contextType: 'installed_base',
        evidence: f.reason,
        confidence: 70,
        ownerId: actorId ?? null,
        dedupeKey: f.dedupeKey,
        actorId: actorId ?? null,
      });
      signals.push(signal);
      if (signal.createdAt >= scanStart) raised += 1;
    }
    this.logger.log(`Growth scan on ${account.name}: ${findings.length} findings, ${raised} new signals`);
    return { findings, raised, signals };
  }
}
