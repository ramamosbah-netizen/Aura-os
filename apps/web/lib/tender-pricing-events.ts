/**
 * One tender's pricing is shown by two components on one page: the resource sheet and the supply
 * sourcing panel. A supply price taken from a supplier line changes the sheet's figures, and a line
 * priced on the sheet creates the build-up the sourcing panel prices into. Each announces a change
 * and the other re-reads the server — neither holds a copy of the other's state.
 */
export const TENDER_PRICING_CHANGED = 'aura:tender-pricing-changed';

export function announcePricingChanged(tenderId: string): void {
  window.dispatchEvent(new CustomEvent(TENDER_PRICING_CHANGED, { detail: { tenderId } }));
}

export function onPricingChanged(tenderId: string, reload: () => void): () => void {
  const handler = (event: Event): void => {
    if ((event as CustomEvent<{ tenderId?: string }>).detail?.tenderId === tenderId) reload();
  };
  window.addEventListener(TENDER_PRICING_CHANGED, handler);
  return () => window.removeEventListener(TENDER_PRICING_CHANGED, handler);
}
