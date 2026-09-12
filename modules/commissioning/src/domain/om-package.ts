import { type Id, newId } from '@aura/shared';

/**
 * The O&M deliverables a client expects for one system, and how far each has got (TC-GATE-5).
 *
 * This is an authority Handover now owns, because nobody else held the fact. DocControl owns
 * controlled documents and can tell you a manual exists; it cannot tell you whether THIS system's
 * O&M pack is complete. Engineering owns drawings, not manuals. So the pack — what is required, what
 * has been submitted, what the client has accepted — lives here.
 *
 * WHAT IT DOES NOT HOLD: the documents. `documentId` is a reference into DocControl, never a copy —
 * no title, no revision, no file. The controlled copy stays where it is controlled, and there is
 * nothing here to drift out of step with it.
 *
 * The lifecycle is the one a handover actually runs:
 *
 *   required → submitted → reviewed → accepted
 *
 * `required: false` is how a deliverable that genuinely does not apply to a system is recorded. That
 * is deliberate: skipping it silently would make "the pack is complete" mean two different things
 * on two different systems.
 */
export const OM_DELIVERABLES = [
  'om_manual',
  'manufacturer_manuals',
  'datasheets',
  'maintenance_schedule',
  'spare_parts_list',
  'software_configuration',
  'licences',
  'warranty_certificate',
  'contact_list',
] as const;

export type OmDeliverable = (typeof OM_DELIVERABLES)[number];

export const OM_DELIVERABLE_LABELS: Record<OmDeliverable, string> = {
  om_manual: 'O&M manual',
  manufacturer_manuals: 'Manufacturer manuals',
  datasheets: 'Datasheets',
  maintenance_schedule: 'Preventive maintenance schedule',
  spare_parts_list: 'Recommended spare parts',
  software_configuration: 'Software and configuration',
  licences: 'Licences',
  warranty_certificate: 'Warranty certificate',
  contact_list: 'Support contacts',
};

export type OmItemState = 'required' | 'submitted' | 'reviewed' | 'accepted';

export interface OmItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  /** The system this deliverable belongs to — a commissioning record. */
  commissioningId: Id;
  deliverable: OmDeliverable;
  required: boolean;
  state: OmItemState;
  /** Reference to the controlled document in DocControl. A reference, never a copy. */
  documentId: string | null;
  notes: string | null;
  submittedAt: string | null;
  submittedBy: Id | null;
  reviewedAt: string | null;
  reviewedBy: Id | null;
  acceptedAt: string | null;
  acceptedBy: Id | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewOmItem {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  commissioningId: Id;
  deliverable: OmDeliverable;
  required?: boolean;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeOmItem(input: NewOmItem): OmItem {
  if (!(OM_DELIVERABLES as readonly string[]).includes(input.deliverable)) {
    throw new Error(`validation: deliverable must be one of: ${OM_DELIVERABLES.join(', ')}`);
  }
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    commissioningId: input.commissioningId,
    deliverable: input.deliverable,
    required: input.required ?? true,
    state: 'required',
    documentId: null,
    notes: input.notes?.trim() || null,
    submittedAt: null,
    submittedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    acceptedAt: null,
    acceptedBy: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

const FORWARD: Record<OmItemState, OmItemState[]> = {
  required: ['submitted'],
  submitted: ['reviewed'],
  reviewed: ['accepted'],
  accepted: [],
};

/**
 * Move a deliverable one step along.
 *
 * One step at a time, in order. Jumping straight from `required` to `accepted` would record an
 * acceptance nobody reviewed, and the whole point of the pack is that somebody looked.
 *
 * Submitting requires a document reference: "submitted" with nothing to point at is a claim, and
 * this authority exists precisely to stop claims standing in for evidence.
 */
export function advanceOmItem(
  item: OmItem,
  to: OmItemState,
  input: { actorId?: Id | null; documentId?: string | null; notes?: string | null } = {},
): OmItem {
  if (!item.required) throw new Error('conflict: this deliverable is marked not required for the system');
  if (!FORWARD[item.state].includes(to)) {
    throw new Error(`only a deliverable in ${FORWARD[item.state].join(' or ') || 'no further state'} order can move to ${to} from ${item.state}`);
  }
  const documentId = input.documentId?.trim() || item.documentId;
  if (to === 'submitted' && !documentId) {
    throw new Error('validation: a controlled document reference is required to submit a deliverable');
  }
  const now = new Date().toISOString();
  return {
    ...item,
    state: to,
    documentId,
    notes: input.notes?.trim() || item.notes,
    submittedAt: to === 'submitted' ? now : item.submittedAt,
    submittedBy: to === 'submitted' ? input.actorId ?? null : item.submittedBy,
    reviewedAt: to === 'reviewed' ? now : item.reviewedAt,
    reviewedBy: to === 'reviewed' ? input.actorId ?? null : item.reviewedBy,
    acceptedAt: to === 'accepted' ? now : item.acceptedAt,
    acceptedBy: to === 'accepted' ? input.actorId ?? null : item.acceptedBy,
    updatedAt: now,
  };
}

/** Mark a deliverable as not applying to this system — recorded, never silently skipped. */
export function setOmRequired(item: OmItem, required: boolean, notes?: string | null): OmItem {
  if (item.state !== 'required' && !required) {
    throw new Error('conflict: a deliverable that has already been submitted cannot be marked not required');
  }
  return { ...item, required, notes: notes?.trim() || item.notes, updatedAt: new Date().toISOString() };
}
