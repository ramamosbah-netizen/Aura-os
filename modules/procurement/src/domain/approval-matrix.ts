// Procurement approval matrix — threshold-based PO authorisation. A PO's value maps to a
// required approval level; below the auto-approve threshold no sign-off is needed, above it
// an approver of at least the required level must approve before the PO can be issued.

export interface ApprovalTier {
  /** Inclusive upper bound for this tier (Infinity for the top tier). */
  upTo: number;
  /** Required approval level (0 = auto-approved, no sign-off). */
  level: number;
  label: string;
}

/** Default tiers (AED). Ordered ascending by threshold. */
export const DEFAULT_PO_APPROVAL_TIERS: ApprovalTier[] = [
  { upTo: 5_000, level: 0, label: 'Auto-approved' },
  { upTo: 50_000, level: 1, label: 'Manager' },
  { upTo: 500_000, level: 2, label: 'Director' },
  { upTo: Infinity, level: 3, label: 'Board' },
];

export interface RequiredApproval {
  level: number;
  label: string;
  autoApproved: boolean;
}

/** The approval required for a PO of `value` under the given tiers. */
export function requiredApproval(value: number, tiers: ApprovalTier[] = DEFAULT_PO_APPROVAL_TIERS): RequiredApproval {
  const v = Math.max(0, Number(value) || 0);
  const tier = tiers.find((t) => v <= t.upTo) ?? tiers[tiers.length - 1];
  return { level: tier.level, label: tier.label, autoApproved: tier.level === 0 };
}
