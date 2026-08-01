import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { PurchaseOrderService } from '@aura/procurement';
import { GoodsReceiptService } from '@aura/inventory';
import { InvoiceService } from '@aura/finance';

// A single row of the 3-way match: what was ordered (PO) vs received (GRNs) vs invoiced (AP).
interface MatchRow {
  poId: string;
  poTitle: string;
  supplierName: string | null;
  status: string;
  ordered: number;
  received: number;
  invoiced: number;
  /** invoiced − received: > 0 means billed beyond what arrived (the risk the finance rule blocks). */
  billingExposure: number;
  matchStatus: 'matched' | 'in_progress' | 'over_received' | 'over_invoiced' | 'unbilled';
}

/**
 * 3-way match reconciliation (PO ↔ GRN ↔ Invoice). The match *rule* is enforced in Finance at
 * invoice approval; this is the read view procurement/finance lacked — see, across every PO,
 * ordered vs received vs invoiced and where billing has run ahead of receipts. Cross-context
 * reads live in the composition layer (ADR-0004), same as PoMatchAdapter.
 */
@Controller('procurement/three-way-match')
export class ThreeWayMatchController {
  constructor(
    private readonly pos: PurchaseOrderService,
    private readonly grns: GoodsReceiptService,
    private readonly invoices: InvoiceService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async match(@Query('status') status?: string): Promise<MatchRow[]> {
    const pos = await this.pos.list({ status });
    return Promise.all(
      pos.map(async (po) => {
        const [grns, invs] = await Promise.all([
          this.grns.list({ poId: po.id }),
          this.invoices.list({ poId: po.id }),
        ]);
        const received = grns
          .filter((g) => g.status === 'received')
          .reduce((s, g) => s + (g.value || 0), 0);
        const invoiced = invs
          .filter((i) => i.status !== 'cancelled')
          .reduce((s, i) => s + (i.value || 0), 0);
        const ordered = po.value || 0;
        const billingExposure = Math.round((invoiced - received) * 100) / 100;

        let matchStatus: MatchRow['matchStatus'];
        const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
        if (invoiced > received + 0.01) matchStatus = 'over_invoiced';
        else if (received > ordered + 0.01) matchStatus = 'over_received';
        else if (invoiced === 0 && received > 0) matchStatus = 'unbilled';
        else if (eq(ordered, received) && eq(received, invoiced) && ordered > 0) matchStatus = 'matched';
        else matchStatus = 'in_progress';

        return {
          poId: po.id,
          poTitle: po.title,
          supplierName: po.supplierName,
          status: po.status,
          ordered,
          received,
          invoiced,
          billingExposure,
          matchStatus,
        };
      }),
    );
  }
}
