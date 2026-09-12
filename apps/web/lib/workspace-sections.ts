import {
  BadgeCheck, Boxes, CircleAlert, ClipboardCheck, ClipboardList, FileCheck2, FileText, Gauge,
  GraduationCap, Hourglass, KeyRound, ListChecks, MessageSquareQuote, NotebookPen, Package,
  PencilRuler, Replace, TrendingUp, TriangleAlert, Users, Wrench,
} from 'lucide-react';
import type { SuiteShortcut } from '@/components/suite-dashboard-shell';

/**
 * The sections of each Delivery Operations workspace, in ONE place.
 *
 * Every one of these workspaces renders its sections twice — as the tab strip inside its client
 * component, and as the shortcut cards at the foot of the page, which a server component builds.
 * Two lists would drift the moment a section is added, and the drift would be invisible: the strip
 * would simply carry work the cards never offer. So the list lives here, in a module neither side
 * owns, and both read it.
 *
 * This is also the only place that decides what a section's URL looks like. Sections are addressable
 * (`?section=`) so a card has somewhere to go, a link can be pasted, and an AURA tab can be reopened
 * days later onto the same work — none of which local component state could do.
 */
export interface WorkspaceSection {
  /** Matches the client component's own section discriminator, and appears in the URL. */
  id: string;
  label: string;
  description: string;
  icon: SuiteShortcut['icon'];
  tone: SuiteShortcut['tone'];
}

/**
 * A section's canonical URL.
 *
 * The FALLBACK section is the workspace's own address, with no query at all — it is what the bare
 * path already shows, and giving it a second URL would mean two links to one view and two AURA tabs
 * for the same work.
 */
export function sectionHref(path: string, section: string, fallback: string): string {
  return section === fallback ? path : `${path}?section=${encodeURIComponent(section)}`;
}

/** The section list as shortcut cards. `counts` is optional: a badge only where a number is owed. */
export function sectionShortcuts(
  path: string,
  sections: readonly WorkspaceSection[],
  fallback: string,
  counts?: Record<string, number | undefined>,
): SuiteShortcut[] {
  return sections.map((section) => ({
    label: section.label,
    description: section.description,
    href: sectionHref(path, section.id, fallback),
    icon: section.icon,
    tone: section.tone,
    count: counts?.[section.id],
  }));
}

export const ENGINEERING_PATH = '/engineering';
/** Engineering's fallback is its Overview, which is a summary rather than a register — so it is not
 *  in this list and gets no card of its own. The other workspaces land directly on a real section. */
export const ENGINEERING_SECTIONS = [
  { id: 'drawings', label: 'Shop Drawings', description: 'Issue and approve shop drawings and revisions', icon: PencilRuler, tone: 'blue' },
  { id: 'rfis', label: 'RFIs', description: 'Requests for information and their answers', icon: MessageSquareQuote, tone: 'amber' },
  { id: 'submittals', label: 'Technical Submittals', description: 'Material, technical and sample submittals in review', icon: ClipboardCheck, tone: 'green' },
  { id: 'technical-queries', label: 'Technical Queries', description: 'Site-raised queries awaiting a technical response', icon: FileText, tone: 'teal' },
  { id: 'design-changes', label: 'Design Changes', description: 'Additions and omissions, with cost and time impact', icon: Replace, tone: 'violet' },
  { id: 'documents', label: 'Documents', description: 'Controlled engineering deliverables and revisions', icon: FileCheck2, tone: 'cyan' },
  { id: 'bim-models', label: 'BIM Models', description: 'Federated models, versions and publication state', icon: Boxes, tone: 'slate' },
] as const satisfies readonly WorkspaceSection[];

export const SITE_PATH = '/site/control';
export const SITE_SECTIONS = [
  { id: 'instructions', label: 'Work Instructions', description: 'Controlled field directions and their acknowledgement', icon: ClipboardList, tone: 'amber' },
  { id: 'daily-reports', label: 'Daily Reports / Site Diary', description: 'Daily progress, manpower and equipment on site', icon: NotebookPen, tone: 'blue' },
  { id: 'delay-logs', label: 'Site Delay Logs', description: 'Disruptions on the ground and their resolution', icon: Hourglass, tone: 'violet' },
  { id: 'material-consumption', label: 'Material Consumption', description: 'What the field has drawn and installed', icon: Package, tone: 'green' },
  { id: 'labour-allocations', label: 'Labour Allocations', description: 'Crews and subcontract labour against the work', icon: Users, tone: 'teal' },
  { id: 'progress-mapping', label: 'Progress % Mapping (vs Baselines)', description: 'Reported progress against the schedule baseline', icon: TrendingUp, tone: 'slate' },
] as const satisfies readonly WorkspaceSection[];

export const QUALITY_PATH = '/quality/control';
export const QUALITY_SECTIONS = [
  { id: 'ncrs', label: 'Non-Conformance Reports (NCR)', description: 'Root cause and corrective action through to closure', icon: CircleAlert, tone: 'amber' },
  { id: 'irs', label: 'Inspection Requests (IR)', description: 'Inspections raised for witness, and their outcome', icon: ClipboardCheck, tone: 'green' },
  { id: 'snags', label: 'Snagging & Punch List', description: 'Outstanding defects held against handover', icon: ListChecks, tone: 'cyan' },
  { id: 'audits', label: 'ISO Checklist Audits', description: 'Audit checklists and the findings they raise', icon: BadgeCheck, tone: 'blue' },
] as const satisfies readonly WorkspaceSection[];

export const COMMISSIONING_PATH = '/commissioning';
/**
 * Testing & commissioning stopped being a single register at TC-GATE-2, which gave it four sections,
 * and reached its full shape at TC-GATE-3 with eight. Each is a job the workspace actually has —
 * never a register sliced by status, which would be a filter wearing a section's clothes.
 *
 * Three of them read work other domains own: Inspection & Test Plans shows Quality's ITP
 * requirements, Pre-Commissioning derives its gates from the ELV register, Engineering and Quality,
 * and Certificates & Records stops at the evidence pack because DocControl owns formal issue.
 */
export const COMMISSIONING_SECTIONS = [
  { id: 'overview', label: 'Overview', description: 'What is preventing these systems from being commissioned', icon: Gauge, tone: 'teal' },
  { id: 'systems', label: 'Systems & Equipment', description: 'Commissioning scope, and the devices under each system', icon: Boxes, tone: 'blue' },
  { id: 'itp', label: 'Inspection & Test Plans', description: 'The Quality ITP requirements that apply to each system', icon: ListChecks, tone: 'violet' },
  { id: 'pre-commissioning', label: 'Pre-Commissioning', description: 'Equipment, installation, engineering and quality before testing starts', icon: Hourglass, tone: 'cyan' },
  { id: 'testing', label: 'Testing & Commissioning', description: 'Execute test points, review run history and sign off', icon: ClipboardCheck, tone: 'green' },
  { id: 'defects', label: 'Defects & Retests', description: 'Failing points, the defects raised from them, and retests owed', icon: TriangleAlert, tone: 'amber' },
  { id: 'certificates', label: 'Certificates & Records', description: 'The evidence pack behind each commissioned system', icon: BadgeCheck, tone: 'blue' },
  { id: 'readiness', label: 'Readiness & Handover', description: 'The full chain to COMMISSIONING READY, which Handover reads', icon: FileCheck2, tone: 'green' },
] as const satisfies readonly WorkspaceSection[];

export const HSE_PATH = '/hse/control';
export const HSE_SECTIONS = [
  { id: 'incidents', label: 'Incident Management & Near Misses', description: 'Reported events, investigation and closure', icon: TriangleAlert, tone: 'amber' },
  { id: 'ptws', label: 'Permit to Work (PTW)', description: 'Permits through request, approval and close-out', icon: KeyRound, tone: 'teal' },
  { id: 'capas', label: 'CAPA Corrective Actions', description: 'Corrective and preventive actions being tracked', icon: Wrench, tone: 'green' },
  { id: 'training', label: 'Safety Training Matrix', description: 'Who is trained, for what, and until when', icon: GraduationCap, tone: 'blue' },
] as const satisfies readonly WorkspaceSection[];
