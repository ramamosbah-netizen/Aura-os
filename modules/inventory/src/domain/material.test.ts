import { describe, it, expect } from 'vitest';
import {
  editMaterial,
  findMaterialByReference,
  makeMaterial,
  mayBeRequisitioned,
  obsoleteMaterial,
  reinstateMaterial,
  snapshotOf,
  type Material,
} from './material';

const base = (over: Partial<Parameters<typeof makeMaterial>[0]> = {}) =>
  makeMaterial({
    tenantId: 't1',
    code: 'CAM-DOME-4MP',
    name: '4MP dome camera',
    specification: 'IP67, 2.8mm fixed lens',
    manufacturer: 'Hikvision',
    model: 'DS-2CD2143G2-I',
    uom: 'nr',
    createdBy: 'u-storekeeper',
    ...over,
  });

describe('a material is what a thing IS, not where it is', () => {
  it('needs the three facts that make a quantity of it meaningful', () => {
    expect(() => base({ code: '   ' })).toThrow(/needs a code/);
    expect(() => base({ name: '' })).toThrow(/needs a name/);
    expect(() => base({ uom: '  ' })).toThrow(/quantity without one means nothing/);
  });

  it('carries make and model, and allows a generic material to have neither', () => {
    expect(base()).toMatchObject({ manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I' });
    const generic = base({ code: 'CBL-CAT6', name: 'Cat6 U/UTP cable', manufacturer: null, model: null, specification: null, uom: 'm' });
    expect(generic).toMatchObject({ manufacturer: null, model: null, specification: null });
  });

  it('keeps the code exactly as authored rather than normalising it', () => {
    // Resolution is case-insensitive; storage is not. Upper-casing would rewrite what was typed.
    expect(base({ code: 'cam-dome-4mp' }).code).toBe('cam-dome-4mp');
  });

  it('starts active', () => {
    expect(base().status).toBe('active');
  });
});

describe('correcting the catalogue cannot rewrite what a document meant', () => {
  it('edits the description freely — citing documents keep their own copy', () => {
    const m = base();
    const corrected = editMaterial(m, { name: '4MP dome camera (IK10)', specification: 'IP67/IK10, 2.8mm' });
    expect(corrected).toMatchObject({ name: '4MP dome camera (IK10)', specification: 'IP67/IK10, 2.8mm' });
    // The snapshot a document took BEFORE the correction still describes what was ordered.
    expect(snapshotOf(m)).toMatchObject({ materialName: '4MP dome camera', specification: 'IP67, 2.8mm fixed lens' });
  });

  it('clears an optional field when explicitly set to null, and leaves it alone when omitted', () => {
    const m = base();
    expect(editMaterial(m, { model: null }).model).toBeNull();
    expect(editMaterial(m, { name: 'renamed' }).model).toBe('DS-2CD2143G2-I');
  });

  it('refuses a nameless material rather than accepting a blank one', () => {
    expect(() => editMaterial(base(), { name: '  ' })).toThrow(/needs a name/);
  });

  it('cannot change the code or the unit through an edit — neither is in the shape', () => {
    const m = base();
    // @ts-expect-error — the edit shape deliberately excludes the identity and the unit.
    const attempted = editMaterial(m, { code: 'OTHER-CODE', uom: 'box' });
    expect(attempted.code).toBe('CAM-DOME-4MP');
    expect(attempted.uom).toBe('nr');
  });
});

describe('retirement is about future demand, not about the past', () => {
  it('refuses new demand with a reason that names the material', () => {
    const retired = obsoleteMaterial(base());
    const verdict = mayBeRequisitioned(retired);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/CAM-DOME-4MP is obsolete and is not active for new demand/);
    // …and says outright that existing records are untouched, because that is the question the
    // person reading the refusal asks next.
    expect(verdict.reason).toMatch(/existing records that cite it are unaffected/);
  });

  it('allows an active material without a reason to give', () => {
    expect(mayBeRequisitioned(base())).toEqual({ allowed: true });
  });

  it('is reversible, and both directions are idempotent', () => {
    const m = base();
    const retired = obsoleteMaterial(m);
    expect(obsoleteMaterial(retired)).toBe(retired);
    expect(reinstateMaterial(retired).status).toBe('active');
    expect(reinstateMaterial(m)).toBe(m);
  });
});

describe('resolving what a person typed', () => {
  const list: Material[] = [base(), base({ code: 'CBL-CAT6', name: 'Cat6 cable', uom: 'm' })];

  it('matches the code a person reads off a shelf label, in any case', () => {
    expect(findMaterialByReference(list, 'cbl-cat6')?.name).toBe('Cat6 cable');
    expect(findMaterialByReference(list, '  CAM-DOME-4MP  ')?.code).toBe('CAM-DOME-4MP');
  });

  it('matches the id too, because machines pass ids', () => {
    expect(findMaterialByReference(list, list[1].id)?.code).toBe('CBL-CAT6');
  });

  it('prefers an id match over a code match, so an exact identity always wins', () => {
    const collide: Material[] = [{ ...list[0], code: list[1].id }, list[1]];
    expect(findMaterialByReference(collide, list[1].id)?.code).toBe('CBL-CAT6');
  });

  it('answers null for a typo rather than guessing the nearest thing', () => {
    expect(findMaterialByReference(list, 'CBL-CAT6X')).toBeNull();
    expect(findMaterialByReference(list, '')).toBeNull();
  });
});

describe('the snapshot a citing document takes', () => {
  it('copies the whole description, so a document never half-describes a material', () => {
    expect(snapshotOf(base())).toEqual({
      materialCode: 'CAM-DOME-4MP',
      materialName: '4MP dome camera',
      specification: 'IP67, 2.8mm fixed lens',
      manufacturer: 'Hikvision',
      model: 'DS-2CD2143G2-I',
      uom: 'nr',
    });
  });

  it('carries the unit, because a quantity copied without its unit is not a quantity', () => {
    expect(snapshotOf(base({ uom: 'm' })).uom).toBe('m');
  });
});
