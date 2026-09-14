import AuraTabLink from './aura-tab-link';
import {
  BadgeCheck,
  Calculator,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderOpen,
  GanttChartSquare,
  ListChecks,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';
import styles from './tender-360-context.module.css';

type TenderContext = {
  id: string;
  title: string;
  reference: string | null;
  status: string;
};

type ContextItem = {
  label: string;
  detail: string;
  owner: string;
  href: string;
  icon: typeof FileText;
  state: string;
  tone: 'teal' | 'blue' | 'amber' | 'violet' | 'slate';
};

/**
 * Tender 360 is a contextual pre-award workspace. It does not own specialist
 * records: each card is a deep link to the canonical domain writer/read model.
 */
export default function Tender360Context({ tender }: { tender: TenderContext }) {
  const decided = tender.status === 'won' || tender.status === 'lost' || tender.status === 'declined';
  const items: ContextItem[] = [
    {
      label: 'Qualification',
      detail: 'Bid / no-bid gate and tender status',
      owner: 'Sales & Commercial',
      href: '#qualification',
      icon: ClipboardCheck,
      state: tender.status,
      tone: 'teal',
    },
    {
      label: 'Scope & specifications',
      detail: 'Review deliverables and technical requirements',
      owner: 'Sales & Commercial',
      href: '#scope',
      icon: ListChecks,
      state: 'Current record',
      tone: 'blue',
    },
    {
      label: 'BOQ workspace',
      detail: 'Prepare quantities after scope review and qualification',
      owner: 'Sales & Commercial',
      href: `/tendering/tenders/${tender.id}/boq`,
      icon: ListChecks,
      state: 'Open workspace',
      tone: 'blue',
    },
    {
      label: 'Estimation & pricing',
      detail: 'Rate build-up, margin and selling price',
      owner: 'Commercial authority',
      href: `/tendering/tenders/${tender.id}/pricing`,
      icon: Calculator,
      state: 'Open workspace',
      tone: 'amber',
    },
    {
      label: 'Technical',
      detail: 'Drawings, RFIs and technical submissions',
      owner: 'Engineering authority',
      href: '/engineering',
      icon: FileCheck2,
      state: 'Open source',
      tone: 'violet',
    },
    {
      label: 'Tender plan',
      detail: 'Pre-award programme and milestones',
      owner: 'Planning authority',
      href: '/projects/schedule',
      icon: GanttChartSquare,
      state: 'Open source',
      tone: 'blue',
    },
    {
      label: 'Clarifications',
      detail: 'Client questions, answers and addenda',
      owner: 'Sales & Commercial',
      href: '#clarifications',
      icon: MessagesSquare,
      state: 'Current record',
      tone: 'slate',
    },
    {
      label: 'Documents & evidence',
      detail: 'Drawings, specifications and tender study files',
      owner: 'DMS authority',
      href: '#scope',
      icon: FolderOpen,
      state: 'Canonical DMS',
      tone: 'slate',
    },
    {
      label: 'Approvals & actions',
      detail: 'Decision queue and governed approvals',
      owner: 'Approval authority',
      href: '/my-work/approvals',
      icon: ShieldCheck,
      state: 'Open queue',
      tone: 'teal',
    },
    {
      label: 'Award & contract',
      detail: decided ? 'Outcome and downstream handoff' : 'Available after governed award',
      owner: 'Contracts authority after award',
      href: tender.status === 'won' ? '/contracts/contracts' : '#status',
      icon: BadgeCheck,
      state: tender.status === 'won' ? 'Open contract context' : 'After award',
      tone: tender.status === 'won' ? 'teal' : 'slate',
    },
  ];

  return (
    <section className={styles.shell} aria-labelledby="tender-360-heading" data-testid="tender-360-context">
      <div className={styles.header}>
        <div>
          <span className={styles.kicker}>SALES &amp; COMMERCIAL / TENDER 360</span>
          <h2 id="tender-360-heading">Tender workspaces · {tender.reference || tender.title}</h2>
          <p>Select a workspace to open its tools, or return to a review section on this dashboard.</p>
        </div>
        <span className={styles.status}>{tender.status}</span>
      </div>

      <nav className={styles.grid} aria-label="Tender workspace launcher">
        {items.map((item) => {
          const Icon = item.icon;
          const isAnchor = item.href.startsWith('#');
          const content = (
            <>
              <span className={`${styles.icon} ${styles[item.tone]}`}><Icon size={16} aria-hidden /></span>
              <span className={styles.copy}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
                <small>{item.owner}</small>
              </span>
              <span className={styles.state}>{item.state}</span>
            </>
          );
          return isAnchor ? (
            <a key={item.label} href={item.href} className={styles.card}>{content}</a>
          ) : (
            <AuraTabLink key={item.label} href={item.href} tabTitle={`${tender.reference || tender.title} · ${item.label}`} tabType="Tender workspace" className={styles.card}>{content}</AuraTabLink>
          );
        })}
      </nav>

      <div className={styles.ownership}>
        <FileText size={15} aria-hidden />
        <span><strong>One record, one owner.</strong> Tender lifecycle, qualification, scope and BOQ remain in Sales. Engineering, Planning, Supply Chain, DMS, Approvals and Contracts are linked here as canonical authorities.</span>
      </div>
      <div className={styles.handoff}>
        <span>PRE-AWARD</span><b>→</b><span>GOVERNED AWARD</span><b>→</b><span>PROJECT 360</span>
        <AuraTabLink href="/projects/projects" tabTitle="Projects" tabType="Tender handoff">Open Projects after award ↗</AuraTabLink>
      </div>
    </section>
  );
}
