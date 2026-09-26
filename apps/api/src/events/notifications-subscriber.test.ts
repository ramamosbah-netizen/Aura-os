import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { NotificationsSubscriber } from './notifications-subscriber';

/** INT-03: an assignment is the assignee's news, not a notice to the whole tenant. */
describe('NotificationsSubscriber — crm.lead.assigned', () => {
  function harness() {
    const handlers = new Map<string, (e: DomainEvent) => void>();
    const bus = { subscribe: vi.fn((type: string, handler: (e: DomainEvent) => void) => { handlers.set(type, handler); }) };
    const notifications = { record: vi.fn(async () => ({})) };
    new NotificationsSubscriber(bus as never, notifications as never).onModuleInit();
    const publish = async (payload: Record<string, unknown>) => {
      handlers.get('crm.lead.assigned')!({ type: 'crm.lead.assigned', tenantId: 't1', aggregateId: 'lead-1', payload } as never);
      await Promise.resolve();
    };
    return { notifications, publish };
  }

  it('addresses the notification to the new owner', async () => {
    const { notifications, publish } = harness();
    // The payload LeadService.assign emits.
    await publish({ fromAssignedTo: 'u-e2e-salesmgr', toAssignedTo: 'u-e2e-sales', assignedBy: 'u-e2e-salesmgr' });
    expect(notifications.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', userId: 'u-e2e-sales', title: 'Lead assigned to you', refType: 'crm.lead', refId: 'lead-1' }),
      [],
      'crm.lead.assigned',
    );
  });

  it('falls back to a tenant-wide notice only when the payload names nobody', async () => {
    const { notifications, publish } = harness();
    await publish({});
    expect(notifications.record).toHaveBeenCalledWith(expect.objectContaining({ userId: null }), [], 'crm.lead.assigned');
  });
});
