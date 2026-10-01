import { type RevenueRecognition, recognizeRevenue } from '@aura/finance';

export interface ProjectRevenueRecognition extends RevenueRecognition {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
}

/**
 * ONE PROJECT'S REVENUE RECOGNITION (IFRS-15 cost-to-cost) — the single place it is composed.
 *
 * Cost and estimate-at-completion come from Projects (the CBS summary), the contract value from the
 * Project (carried from the contract), billing from Finance AR. The finance route and the executive
 * decision view both call this, so the figure an executive is shown and the one Finance reports are
 * the same computation, not two that happen to agree today.
 */
export function projectRevenueRecognition(
  project: { id: string; title: string; status: string; value: number; contractId: string | null },
  summary: { totalActual: number; totalForecast: number },
  invoices: Array<{ projectId: string | null; contractRef: string | null; subtotal: number; status: string }>,
): ProjectRevenueRecognition {
  // Billed = net (ex-VAT) of non-cancelled invoices tied to this project, by projectId
  // OR by contractRef (IPC-generated AR invoices carry the contract reference).
  const billedToDate = invoices
    .filter(
      (inv) =>
        inv.status !== 'cancelled' &&
        (inv.projectId === project.id || (!!project.contractId && inv.contractRef === project.contractId)),
    )
    .reduce((sum, inv) => sum + (inv.subtotal || 0), 0);

  const rr = recognizeRevenue({
    contractValue: project.value,
    costIncurred: summary.totalActual,
    estimatedTotalCost: summary.totalForecast,
    billedToDate,
  });

  return { projectId: project.id, projectTitle: project.title, projectStatus: project.status, ...rr };
}
