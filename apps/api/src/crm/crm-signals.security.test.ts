import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { CrmSignalsController } from './crm-signals.controller';

const permissionOf = (handler: string): string[] | undefined =>
  Reflect.getMetadata(PERMISSIONS_KEY, (CrmSignalsController.prototype as Record<string, unknown>)[handler]);

describe('CRM signal authorization contract', () => {
  it('maps each Radar operation to the narrow business capability', () => {
    expect(permissionOf('create')).toEqual(['crm.signal.create']);
    expect(permissionOf('list')).toEqual(['crm.signal.read']);
    expect(permissionOf('paged')).toEqual(['crm.signal.read']);
    expect(permissionOf('radar')).toEqual(['crm.signal.read']);
    expect(permissionOf('get')).toEqual(['crm.signal.read']);
    expect(permissionOf('advance')).toEqual(['crm.signal.update']);
    expect(permissionOf('dismiss')).toEqual(['crm.signal.update']);
    expect(permissionOf('promote')).toEqual(['crm.signal.update', 'crm.lead.create']);
  });
});
