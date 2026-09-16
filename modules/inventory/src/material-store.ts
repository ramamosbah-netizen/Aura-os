import type { Material } from './domain/material';

export const MATERIAL_STORE = Symbol('MATERIAL_STORE');

export interface MaterialFilter {
  status?: 'active' | 'obsolete';
  /** Case-insensitive contains over code and name — what a picker types. */
  search?: string;
}

export interface MaterialStore {
  save(material: Material): Promise<void>;
  find(id: string, tenantId: string): Promise<Material | null>;
  /** By the tenant-unique code, matched without case. The key a person types. */
  findByCode(code: string, tenantId: string): Promise<Material | null>;
  /**
   * Resolve several references at once, by id or code.
   *
   * Takes the references and looks each one up directly rather than listing the catalogue and
   * searching it — the defect TC-GATE-18 pinned in Inventory's other resolver, where a default
   * LIMIT 200 made the two-hundred-and-first part read as "not in inventory" and a write that
   * checked the reference refused a perfectly real one.
   */
  resolveMany(references: string[], tenantId: string): Promise<Material[]>;
  list(tenantId: string, filter?: MaterialFilter): Promise<Material[]>;
}
