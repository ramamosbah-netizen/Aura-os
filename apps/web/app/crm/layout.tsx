import type { ReactNode } from 'react';
import CrmAdvisor from '../../components/crm-advisor';

// Shared layout for every CRM page. Renders the page plus the ambient Relationship
// Advisor side panel, so the "act on this now" signals ride along wherever you are
// in the CRM. The layout keeps CrmAdvisor mounted across CRM page navigations
// (so a hide sticks while you move around) and re-opens it on a full page load.
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <CrmAdvisor />
    </>
  );
}
