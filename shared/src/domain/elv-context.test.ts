import { describe, it, expect } from 'vitest';
import {
  contextCompleteness,
  hasWorkableContext,
  normalizeElvSystems,
  ELV_SYSTEMS,
  ELV_SYSTEM_LABELS,
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
