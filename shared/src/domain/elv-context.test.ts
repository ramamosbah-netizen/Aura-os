import { describe, it, expect } from 'vitest';
import {
  contextCompleteness,
  hasWorkableContext,
  normalizeElvSystems,
  ELV_SYSTEMS,
  ELV_SYSTEM_LABELS,
  toElvSystem,
  toElvSystemOrNull,
} from './elv-context';

describe('normalizeElvSystems', () => {
  it('keeps known systems, drops junk — the list is a routing key, not free text', () => {
    expect(normalizeElvSystems(['cctv', 'nonsense', 'fire_alarm'])).toEqual(['cctv', 'fire_alarm']);
  });

  it('de-duplicates while preserving the order the user entered', () => {
    expect(normalizeElvSystems(['fire_alarm', 'cctv', 'fire_alarm'])).toEqual(['fire_alarm', 'cctv']);
  });

  it('is null for a non-list or an all-junk list, never an empty array', () => {
    // Null and [] would read differently in the UI ("not asked" vs "asked, none apply").
    expect(normalizeElvSystems('cctv')).toBeNull();
    expect(normalizeElvSystems(['nope'])).toBeNull();
    expect(normalizeElvSystems(null)).toBeNull();
  });

  it('every system has a label — a code with no label leaks into the UI', () => {
    for (const s of ELV_SYSTEMS) expect(ELV_SYSTEM_LABELS[s]).toBeTruthy();
  });
});

describe('hasWorkableContext', () => {
  it('is true once we know what they want, in words or systems', () => {
    expect(hasWorkableContext({ requirement: 'CCTV for a villa' })).toBe(true);
    expect(hasWorkableContext({ systems: ['cctv'] })).toBe(true);
  });

  it('is false when we only know who called — the pre-G4 state of every lead', () => {
    expect(hasWorkableContext({})).toBe(false);
    expect(hasWorkableContext({ projectName: 'Marina Tower', requirement: '   ' })).toBe(false);
  });
});

describe('contextCompleteness', () => {
  it('is 0 for an empty context and 100 for a full one', () => {
    expect(contextCompleteness({})).toBe(0);
    expect(
      contextCompleteness({
        requirement: 'CCTV + ACS retrofit', systems: ['cctv', 'access_control'], sector: 'hospitality',
        projectName: 'Marina Hotel', projectLocation: 'Dubai Marina', consultant: 'AECOM',
        estimatedValue: 750_000, projectStage: 'fit_out', expectedTimeline: 'Q3 2026',
      }),
    ).toBe(100);
  });

  it('counts consultant OR main contractor — a direct job has neither, and is not penalised twice', () => {
    const base = { requirement: 'CCTV' };
    expect(contextCompleteness({ ...base, consultant: 'AECOM' })).toBe(contextCompleteness({ ...base, mainContractor: 'ALEC' }));
  });

  it('does not count an unknown project stage or a zero value as known', () => {
    expect(contextCompleteness({ projectStage: 'unknown', estimatedValue: 0 })).toBe(0);
  });
});

describe('taxonomy merge — aliases (ELV core)', () => {
  it('understands the spelling Commissioning used, instead of demoting those rows to other', () => {
    // aura_commissioning_records holds `pa_va` written before the two taxonomies were merged.
    // A plain membership test would have silently reclassified every one of them.
    expect(toElvSystem('pa_va')).toBe('public_address');
    expect(toElvSystem('acs')).toBe('access_control');
    expect(toElvSystem('lan')).toBe('network');
  });

  it('carries network, which Commissioning had and the canonical list did not', () => {
    expect(ELV_SYSTEMS).toContain('network');
    expect(toElvSystem('network')).toBe('network');
    expect(ELV_SYSTEM_LABELS.network).toBeTruthy();
  });

  it('is case- and whitespace-insensitive, because these arrive from imports and forms', () => {
    expect(toElvSystem('  CCTV  ')).toBe('cctv');
    expect(toElvSystem('PA_VA')).toBe('public_address');
  });

  it('separates "unrecognised" from "other" so a caller can choose which it wants', () => {
    expect(toElvSystemOrNull('nonsense')).toBeNull();
    expect(toElvSystem('nonsense')).toBe('other');
  });

  it('keeps aliases resolving through the list normaliser too', () => {
    expect(normalizeElvSystems(['pa_va', 'cctv', 'junk'])).toEqual(['public_address', 'cctv']);
  });
});
