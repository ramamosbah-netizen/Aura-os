import { newId, type Id } from '@aura/shared';

/**
 * The material master — WHAT a thing is, separate from where any of it happens to be.
 *
 * Inventory already declared itself the authority for a part (migration 0304). This keeps that
 * authority and removes the confusion inside it: a stock item was a code, a name, a unit, a
 * WAREHOUSE and a QUANTITY, so identity and position were one record. A material that has never
 * been stocked had nowhere to exist, and a material bought for direct delivery to site never
 * appeared at all — which is precisely the thing a requisition needs to be able to name.
 *
 * Nothing about a material's identity depends on where it is held, who supplies it, whether it has
 * been approved on a project, or which project wants it. All of those point AT a material and add
 * their own facts. That independence is what lets one identity be followed from a requisition line
 * through a quotation, an order, a receipt, a stock position, a site issue and an installation —
 * and it is what makes the Wave 5 question answerable at all: is the thing installed the thing that
 * was approved, purchased and received?
 */
export interface Material {
  id: Id;
  tenantId: string;
  companyId: string | null;
  /** The human identity, unique per tenant. Immutable — see `renameMaterial`. */
  code: string;
  name: string;
  /** Free technical text from a specification or datasheet. A generic item legitimately has none. */
  specification: string | null;
  /** SUP-03's make and model. Null on a generic material several products could satisfy. */
  manufacturer: string | null;
  model: string | null;
  /** The unit every quantity of this material means. Immutable — see `MATERIAL_UOM_IMMUTABLE`. */
  uom: string;
  status: MaterialStatus;
  createdBy: Id | null;
  createdAt: string;
}

export const MATERIAL_STATUSES = ['active', 'obsolete'] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export interface NewMaterial {
  tenantId: string;
  companyId?: string | null;
  code: string;
  name: string;
  specification?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  uom: string;
  createdBy?: Id | null;
}

/** Descriptive fields a correction may touch. Code and unit are deliberately absent. */
export interface MaterialEdit {
  name?: string;
  specification?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

const trimOrNull = (v: string | null | undefined): string | null => v?.trim() || null;

export function makeMaterial(input: NewMaterial): Material {
  const code = input.code?.trim();
  const name = input.name?.trim();
  const uom = input.uom?.trim();
  if (!code) throw new Error('a material needs a code — it is what a person types to ask for one');
  if (!name) throw new Error('a material needs a name');
  if (!uom) throw new Error('a material needs a unit of measure — a quantity without one means nothing');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    // Codes are matched case-insensitively when resolved, so they are stored as authored but
    // compared without case. Upper-casing them here would rewrite what somebody typed.
    code,
    name,
    specification: trimOrNull(input.specification),
    manufacturer: trimOrNull(input.manufacturer),
    model: trimOrNull(input.model),
    uom,
    status: 'active',
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export const MATERIAL_CODE_IMMUTABLE =
  'a material code cannot be changed: it is the identity people type from a shelf label and the key ' +
  'every existing reference resolved on, so re-pointing it would silently rewrite what they meant';

export const MATERIAL_UOM_IMMUTABLE =
  'a material unit of measure cannot be changed: the unit is what its quantities MEAN, so changing ' +
  'it reinterprets every on-hand balance and open demand without anyone editing a number — a ' +
  'material counted differently is a different material';

/**
 * Correct a catalogue entry.
 *
 * Safe to do freely, because every commercial document that cites a material keeps its OWN copy of
 * the description at the moment it cited it. Fixing a typo in the master today cannot change what
 * an order meant last year — the order is not reading this record.
 *
 * Code and unit are refused rather than ignored: silently dropping a field somebody asked to change
 * would leave them believing it had changed.
 */
export function editMaterial(material: Material, edit: MaterialEdit): Material {
  const next: Material = { ...material };
  if (edit.name !== undefined) {
    const name = edit.name?.trim();
    if (!name) throw new Error('a material needs a name');
    next.name = name;
  }
  if (edit.specification !== undefined) next.specification = trimOrNull(edit.specification);
  if (edit.manufacturer !== undefined) next.manufacturer = trimOrNull(edit.manufacturer);
  if (edit.model !== undefined) next.model = trimOrNull(edit.model);
  return next;
}

/**
 * Retire a material from future demand.
 *
 * Retirement is a statement about what may be requisitioned NEXT, never a claim that the past did
 * not happen: every requisition, order and receipt already citing this material stays valid and
 * readable. Deleting it instead would orphan those records, and marking them invalid would be a
 * lie about work that really was done.
 */
export function obsoleteMaterial(material: Material): Material {
  if (material.status === 'obsolete') return material;
  return { ...material, status: 'obsolete' };
}

export function reinstateMaterial(material: Material): Material {
  if (material.status === 'active') return material;
  return { ...material, status: 'active' };
}

/**
 * May this material be named on NEW demand?
 *
 * Asked as a question with a reason rather than a bare boolean, so a refusal can say which material
 * and why — "MAT-0007 is obsolete" is actionable; `false` is not.
 */
export function mayBeRequisitioned(material: Material): { allowed: boolean; reason?: string } {
  if (material.status === 'obsolete') {
    return {
      allowed: false,
      reason: `material ${material.code} is obsolete and is not active for new demand (existing records that cite it are unaffected)`,
    };
  }
  return { allowed: true };
}

/**
 * Match a typed reference to a material, by id or by code, case-insensitively.
 *
 * By CODE as well as id for the reason Inventory's existing stock-reference resolver gives: the
 * control that captures this asks a person for a material, and a person types the code they can see
 * — `CAM-DOME-4MP` — never a UUID.
 */
export function findMaterialByReference(materials: Material[], reference: string): Material | null {
  const needle = reference?.trim().toLowerCase();
  if (!needle) return null;
  return (
    materials.find((m) => m.id.toLowerCase() === needle) ??
    materials.find((m) => m.code.trim().toLowerCase() === needle) ??
    null
  );
}

/**
 * The description a citing document copies when it names this material.
 *
 * Deliberately a whole snapshot rather than field-by-field copying at each call site: a document
 * that took the name but not the unit, or the model but not the manufacturer, would describe
 * something that never existed.
 */
export interface MaterialSnapshot {
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  uom: string;
}

export function snapshotOf(material: Material): MaterialSnapshot {
  return {
    materialCode: material.code,
    materialName: material.name,
    specification: material.specification,
    manufacturer: material.manufacturer,
    model: material.model,
    uom: material.uom,
  };
}
