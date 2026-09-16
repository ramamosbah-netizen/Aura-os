import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { MATERIAL_STORE, type MaterialFilter, type MaterialStore } from './material-store';
import {
  editMaterial,
  type Material,
  MATERIAL_CODE_IMMUTABLE,
  MATERIAL_UOM_IMMUTABLE,
  type MaterialEdit,
  makeMaterial,
  mayBeRequisitioned,
  obsoleteMaterial,
  reinstateMaterial,
  type NewMaterial,
  snapshotOf,
  type MaterialSnapshot,
} from './domain/material';

/**
 * The material master — Inventory's catalogue of WHAT things are.
 *
 * Kept in Inventory because Inventory already declared itself the authority for a part (migration
 * 0304), and the separation this introduces is between identity and POSITION, not between
 * departments. A stock item says where some of a material is; this says what the material is.
 */
@Injectable()
export class MaterialService {
  private readonly logger = new Logger('Inventory');

  constructor(
    @Inject(MATERIAL_STORE) private readonly store: MaterialStore,
    // Explicit @Inject: a union-typed ctor param emits `Object` in design:paramtypes and silently
    // injects null. Optional so in-memory tests need no context.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  private tenantOf(tenantId?: string): string {
    const bound = this.tenant?.boundTenantId();
    return bound ?? tenantId ?? '';
  }

  async create(input: NewMaterial): Promise<Material> {
    const material = makeMaterial({ ...input, tenantId: this.tenantOf(input.tenantId) });
    // The code is the identity people transact on, so a collision is refused BEFORE the unique
    // index refuses it — the index would answer with a constraint name, and the person who typed
    // the code needs to be told which material already holds it.
    const existing = await this.store.findByCode(material.code, material.tenantId);
    if (existing) {
      throw new Error(`material code ${material.code} is already used by "${existing.name}"`);
    }
    await this.store.save(material);
    this.logger.log(`Material created: ${material.code} — ${material.name} (${material.uom})`);
    return material;
  }

  async get(id: string, tenantId?: string): Promise<Material> {
    const material = await this.store.find(id, this.tenantOf(tenantId));
    if (!material) throw new Error(`not found: material ${id}`);
    return material;
  }

  list(tenantId?: string, filter?: MaterialFilter): Promise<Material[]> {
    return this.store.list(this.tenantOf(tenantId), filter);
  }

  /**
   * Correct a catalogue entry.
   *
   * An attempt to change the code or the unit is REFUSED rather than ignored: silently dropping a
   * field somebody asked to change would leave them believing it had changed, and both of these
   * are exactly the fields whose quiet change does the damage.
   */
  async edit(id: string, edit: MaterialEdit & { code?: string; uom?: string }, tenantId?: string): Promise<Material> {
    const material = await this.get(id, tenantId);
    if (edit.code !== undefined && edit.code.trim() !== material.code) throw new Error(MATERIAL_CODE_IMMUTABLE);
    if (edit.uom !== undefined && edit.uom.trim() !== material.uom) throw new Error(MATERIAL_UOM_IMMUTABLE);
    const next = editMaterial(material, edit);
    await this.store.save(next);
    return next;
  }

  async setStatus(id: string, status: 'active' | 'obsolete', tenantId?: string): Promise<Material> {
    const material = await this.get(id, tenantId);
    const next = status === 'obsolete' ? obsoleteMaterial(material) : reinstateMaterial(material);
    if (next === material) return material;
    await this.store.save(next);
    this.logger.log(`Material ${material.code} is now ${next.status}`);
    return next;
  }

  /**
   * Resolve a reference — an id or a code — for a caller that is about to CITE this material.
   *
   * Returns the material and the snapshot to copy, together. A caller that took the identity
   * without the description, or assembled the description itself, would record something that
   * never existed.
   *
   * Refuses an obsolete material, because this is the path new demand goes through. Documents that
   * already cite it are untouched — retirement is a statement about what may be ordered next.
   */
  async resolveForCitation(
    reference: string,
    tenantId?: string,
  ): Promise<{ material: Material; snapshot: MaterialSnapshot }> {
    const bound = this.tenantOf(tenantId);
    const needle = reference?.trim();
    if (!needle) throw new Error('a material reference is required');
    const [material] = await this.store.resolveMany([needle], bound);
    if (!material) {
      throw new Error(`no material matches "${needle}" — a requisition must name one from the catalogue`);
    }
    const verdict = mayBeRequisitioned(material);
    if (!verdict.allowed) throw new Error(verdict.reason);
    return { material, snapshot: snapshotOf(material) };
  }

  /**
   * The flat citation another module's port asks for — identity and description in one answer.
   *
   * Deliberately shaped to satisfy Procurement's `MaterialCatalogue` STRUCTURALLY rather than by
   * importing it: Inventory must not depend on Procurement any more than the reverse (ADR-0004).
   * The composition root binds the two.
   */
  async citeMaterial(reference: string, tenantId: string): Promise<{
    materialId: string;
    materialCode: string;
    materialName: string;
    specification: string | null;
    manufacturer: string | null;
    model: string | null;
    uom: string;
  }> {
    const { material, snapshot } = await this.resolveForCitation(reference, tenantId);
    return { materialId: material.id, ...snapshot };
  }
}
