import type { MaterialFilter, MaterialStore } from './material-store';
import type { Material } from './domain/material';

export class InMemoryMaterialStore implements MaterialStore {
  private readonly materials = new Map<string, Material>();

  async save(material: Material): Promise<void> {
    this.materials.set(material.id, { ...material });
  }

  async find(id: string, tenantId: string): Promise<Material | null> {
    const m = this.materials.get(id);
    return m && m.tenantId === tenantId ? { ...m } : null;
  }

  async findByCode(code: string, tenantId: string): Promise<Material | null> {
    const needle = code.trim().toLowerCase();
    const m = [...this.materials.values()].find(
      (x) => x.tenantId === tenantId && x.code.trim().toLowerCase() === needle,
    );
    return m ? { ...m } : null;
  }

  async resolveMany(references: string[], tenantId: string): Promise<Material[]> {
    const needles = new Set(references.map((r) => r.trim().toLowerCase()).filter(Boolean));
    if (needles.size === 0) return [];
    return [...this.materials.values()]
      .filter((m) => m.tenantId === tenantId
        && (needles.has(m.id.toLowerCase()) || needles.has(m.code.trim().toLowerCase())))
      .map((m) => ({ ...m }));
  }

  async list(tenantId: string, filter?: MaterialFilter): Promise<Material[]> {
    const search = filter?.search?.trim().toLowerCase();
    return [...this.materials.values()]
      .filter((m) => m.tenantId === tenantId
        && (!filter?.status || m.status === filter.status)
        && (!search || m.code.toLowerCase().includes(search) || m.name.toLowerCase().includes(search)))
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
      .map((m) => ({ ...m }));
  }
}
