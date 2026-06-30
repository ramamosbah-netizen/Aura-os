import { describe, it, expect } from 'vitest';
import { makeToolboxTalk } from './toolbox-talk';

const base = { tenantId: 't1', projectId: 'p1', topic: 'Working at height', conductedBy: 'HSE Officer', talkDate: '2026-06-29', attendeeCount: 12 };

describe('makeToolboxTalk', () => {
  it('creates a talk record', () => {
    const t = makeToolboxTalk({ ...base, projectName: 'Tower A', notes: 'Harness checks' });
    expect(t.topic).toBe('Working at height');
    expect(t.attendeeCount).toBe(12);
    expect(t.notes).toBe('Harness checks');
    expect(t.id).toBeTruthy();
  });

  it('requires projectId, topic, conductedBy', () => {
    expect(() => makeToolboxTalk({ ...base, projectId: '' })).toThrow('projectId is required');
    expect(() => makeToolboxTalk({ ...base, topic: '  ' })).toThrow('topic is required');
    expect(() => makeToolboxTalk({ ...base, conductedBy: '' })).toThrow('conductedBy is required');
  });

  it('validates the date format', () => {
    expect(() => makeToolboxTalk({ ...base, talkDate: '29-06-2026' })).toThrow('YYYY-MM-DD');
  });

  it('requires a positive integer attendee count', () => {
    expect(() => makeToolboxTalk({ ...base, attendeeCount: 0 })).toThrow('positive integer');
    expect(() => makeToolboxTalk({ ...base, attendeeCount: 3.5 })).toThrow('positive integer');
  });

  it('defaults notes to empty', () => {
    expect(makeToolboxTalk(base).notes).toBe('');
  });
});
