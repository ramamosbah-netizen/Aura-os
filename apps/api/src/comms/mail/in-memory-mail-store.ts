import type { MailRecord } from './mail-domain';
import { normaliseAddress } from './mail-domain';
import type { DispatchRecord, MailFilter, MailStore } from './mail-store';

/**
 * In-memory mail persistence so the API boots and the suite runs without a database, matching
 * every other AURA store. Not the production path: without DATABASE_URL, mail is lost on restart,
 * which is exactly what the Postgres store exists to prevent.
 */
export class InMemoryMailStore implements MailStore {
  private readonly mail = new Map<string, Map<string, MailRecord>>();
  private readonly reads = new Map<string, Set<string>>();
  private readonly dispatch = new Map<string, Map<string, DispatchRecord>>();

  private box(tenantId: string): Map<string, MailRecord> {
    let box = this.mail.get(tenantId);
    if (!box) { box = new Map(); this.mail.set(tenantId, box); }
    return box;
  }

  private queue(tenantId: string): Map<string, DispatchRecord> {
    let queue = this.dispatch.get(tenantId);
    if (!queue) { queue = new Map(); this.dispatch.set(tenantId, queue); }
    return queue;
  }

  async save(tenantId: string, mail: MailRecord): Promise<void> {
    this.box(tenantId).set(mail.id, structuredClone(mail));
  }

  async get(tenantId: string, mailId: string): Promise<MailRecord | null> {
    const found = this.box(tenantId).get(mailId);
    return found ? structuredClone(found) : null;
  }

  /** Does this reader appear on the envelope in one of the given roles? */
  private matches(mail: MailRecord, filter: MailFilter, roles: string[]): boolean {
    return mail.participants.some((participant) => {
      if (!roles.includes(participant.role)) return false;
      if (filter.address && participant.address && normaliseAddress(participant.address) === normaliseAddress(filter.address)) return true;
      return Boolean(filter.userId && participant.userId === filter.userId);
    });
  }

  async list(tenantId: string, filter: MailFilter): Promise<MailRecord[]> {
    const all = [...this.box(tenantId).values()];
    const limit = Math.min(filter.limit ?? 100, 500);

    if (filter.folder === 'drafts' || filter.folder === 'scheduled') {
      const state = filter.folder === 'drafts' ? 'draft' : 'scheduled';
      return all
        .filter((mail) => mail.state === state && mail.fromUser === (filter.userId ?? null))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((mail) => structuredClone(mail));
    }

    const visible: MailRecord['state'][] = ['sent', 'received', 'queued', 'sending', 'failed'];
    const roles = filter.folder === 'sent' ? ['from'] : ['to', 'cc', 'bcc'];
    return all
      .filter((mail) => visible.includes(mail.state) && this.matches(mail, filter, roles))
      .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
      .slice(0, limit)
      .map((mail) => structuredClone(mail));
  }

  async thread(tenantId: string, threadId: string): Promise<MailRecord[]> {
    return [...this.box(tenantId).values()]
      .filter((mail) => mail.threadId === threadId)
      .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt))
      .map((mail) => structuredClone(mail));
  }

  async remove(tenantId: string, mailId: string): Promise<void> {
    this.box(tenantId).delete(mailId);
  }

  async markRead(tenantId: string, mailId: string, reader: { address?: string | null; userId?: string | null }, _at: string): Promise<void> {
    const mail = this.box(tenantId).get(mailId);
    if (!mail) return;
    const isRecipient = this.matches(mail, { address: reader.address, userId: reader.userId }, ['to', 'cc', 'bcc']);
    if (!isRecipient) return;
    const key = `${mailId}::${reader.address ?? reader.userId}`;
    const set = this.reads.get(tenantId) ?? new Set<string>();
    set.add(key);
    this.reads.set(tenantId, set);
  }

  async findByProviderMessage(tenantId: string, accountId: string | null, providerMessageId: string): Promise<MailRecord | null> {
    const found = [...this.box(tenantId).values()].find(
      (mail) => mail.providerMessageId === providerMessageId && (mail.accountId ?? null) === (accountId ?? null),
    );
    return found ? structuredClone(found) : null;
  }

  async upsertDispatch(tenantId: string, dispatch: DispatchRecord): Promise<void> {
    this.queue(tenantId).set(dispatch.subjectId, structuredClone(dispatch));
  }

  async getDispatch(tenantId: string, subjectId: string): Promise<DispatchRecord | null> {
    const found = this.queue(tenantId).get(subjectId);
    return found ? structuredClone(found) : null;
  }

  async cancelDispatch(tenantId: string, subjectId: string, _at: string): Promise<void> {
    const found = this.queue(tenantId).get(subjectId);
    // Mirrors the Postgres rule: a dispatch already in flight belongs to the worker.
    if (found && (found.state === 'pending' || found.state === 'claimed')) {
      this.queue(tenantId).set(subjectId, { ...found, state: 'cancelled' });
    }
  }
}
