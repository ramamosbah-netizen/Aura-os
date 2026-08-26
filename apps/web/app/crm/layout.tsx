import type { ReactNode } from 'react';

/**
 * Shared layout for every CRM page.
 *
 * The ambient Relationship Advisor side panel was removed: AURA already has ONE assistant surface
 * (the deal brief / copilot), and a second always-on advisor rail competed with it — two engines
 * offering "act on this now" signals, with no shared definition of what needs attention. Keeping a
 * single intelligence surface is also what the Opportunity 360 programme depends on.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
