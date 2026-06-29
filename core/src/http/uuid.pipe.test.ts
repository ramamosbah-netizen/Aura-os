import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { isUuid, ParseUuidOr404Pipe } from './uuid.pipe';

describe('isUuid', () => {
  it('accepts a valid v4 UUID', () => {
    expect(isUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });
  it('rejects a plain string', () => {
    expect(isUuid('claims')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isUuid('')).toBe(false);
  });
});

describe('ParseUuidOr404Pipe', () => {
  const pipe = new ParseUuidOr404Pipe();

  it('passes through a valid UUID', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(pipe.transform(id)).toBe(id);
  });

  it('throws NotFoundException for non-UUID', () => {
    expect(() => pipe.transform('claims')).toThrow(NotFoundException);
  });
});
