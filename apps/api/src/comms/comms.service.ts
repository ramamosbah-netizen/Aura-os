import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { AccessService, EventBus, NotificationService, UsersService } from '@aura/core';
import { ProjectService } from '@aura/projects';
import {
  type ChatChannel,
  type ChatMessage,
  type MailMessage,
  type Mailbox,
  type NewChatMessage,
  type NewMail,
  defaultChannelsForDirectory,
  displayName,
  dmChannelId,
  dmPeer,
  mailboxFor,
  makeChatMessage,
  makeMail,
  makeEvent,
  newId,
  unreadChatCount,
} from '@aura/shared';
import { WorkspaceConfigService } from '../workspace/workspace-config.service';
import { COMMS_STORE, type CommsStore, type StoredChannel, type TimelineEntry } from './comms-store';
import { MAIL_STORE, type MailStore } from './mail/mail-store';
import { WHATSAPP_STORE, type WhatsAppStore } from './whatsapp/whatsapp-store';

/**
 * Who may see a channel, and therefore its messages and their attachments.
 *
 *   company     — everyone in the tenant. Unchanged: this is the all-hands channel.
 *   dm          — the two participants, and NOBODY else. Deliberately no admin bypass: an
 *                 administrator needs to run the platform, not read two colleagues' private
 *                 messages. This is the one rule that tightens existing behaviour, because
 *                 `visibleChannels` handed an admin every DM in the tenant.
 *   team/dept/  — members, or an admin. Administering a shared workspace channel is a real job.
 *   project
 *
 * Exported so the negative security tests can drive it directly as well as through HTTP.
 */
export function canAccessChannel(
  channel: StoredChannel,
  username: string,
  isAdmin: boolean,
  callerCompanyId: string | null = null,
): boolean {
  // Company isolation is checked FIRST, so it cannot be argued away by membership or by being an
  // administrator. A channel stamped for company Y is not company X's to read, full stop.
  //
  // `companyId: null` on the channel means tenant-global — the seeded directory channels, shared
  // by the whole tenant. This mirrors the workflow store's tenant-global convention rather than
  // inventing a second one.
  //
  // Worth stating plainly: today every locally issued session carries companyId = null, because
  // auth.controller mints `companyId: null` and verify() falls back to null when the IdP sends no
  // company claim. So this rule is INERT in the current deployment — which is exactly why it is
  // tested with explicit company values instead of through a session, and why writing
  // `channel.companyId === ctx.companyId` and calling it isolation would have been false comfort.
  if (channel.companyId !== null && channel.companyId !== callerCompanyId) return false;

  if (channel.kind === 'dm') return channel.members.includes(username);
  if (channel.kind === 'company') return true;
  return isAdmin || channel.members.includes(username);
}

/**
 * Project a canonical MailRecord back to the legacy MailMessage the web hub consumes. Kept as a
 * projection rather than a stored shape so the old consumers keep working untouched while the
 * canonical model moves ahead of them.
 */
function toLegacyMail(mail: MailRecordLike): MailMessage {
  // BCC is deliberately absent. The legacy MailMessage has a single flat `to[]` with no way to
  // mark a recipient blind, so including one would show every reader who was copied invisibly —
  // the exact disclosure a blind copy exists to prevent. A shape that cannot represent it safely
  // does not get to carry it.
  const recipients = mail.participants.filter((p) => p.role === 'to' || p.role === 'cc');
  const sender = mail.fromUser ?? mail.participants.find((p) => p.role === 'from')?.userId ?? '';
  return {
    id: mail.id,
    from: sender,
    to: recipients.map((p) => p.userId ?? p.address ?? '').filter(Boolean),
    subject: mail.subject,
    body: mail.body,
    sentAt: mail.sentAt ?? mail.createdAt,
    readBy: [sender, ...recipients.filter((p) => p.readAt).map((p) => p.userId ?? p.address ?? '')].filter(Boolean),
  };
}

interface MailRecordLike {
  id: string;
  fromUser: string | null;
  subject: string;
  body: string;
  sentAt: string | null;
  createdAt: string;
  participants: Array<{ role: string; address?: string | null; userId?: string | null; readAt?: string | null }>;
}

export interface ChannelSummary extends ChatChannel {
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

export interface ChatPerson {
  username: string;
  roleLabel: string;
  companyId: string | null;
}

/** A read-only projection of attachments shared in conversations the caller may access. */
export interface CommunicationFile {
  id: string;
  channelId: string;
  channelName: string;
  sender: string;
  kind: 'file' | 'voice';
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  sentAt: string;
}

/** One actionable row in the Communication unread view. */
export interface UnreadCommunication {
  id: string;
  source: 'chat' | 'mail' | 'whatsapp';
  title: string;
  detail: string;
  date: string;
  channelId: string | null;
  mailId: string | null;
  threadId: string | null;
}

interface DirectoryPerson extends ChatPerson {
  active: boolean;
}

/**
 * Team chat + internal mail, tenant-scoped, persisted through CommsStore (migration 0234).
 * Channels are seeded from the workspace directory so the org structure (company / departments)
 * matches the admin-configured roles; seeding is idempotent, so a restart re-asserts the same
 * channels without duplicating them or losing the conversations inside them.
 *
 * Every chat message and mail emits a notification for its recipients — the notification center
 * is the single "everything" feed.
 */
@Injectable()
export class CommsService {
  private readonly logger = new Logger('Comms');
  /** Tenants whose directory channels have been asserted this process. Not a data cache. */
  private readonly seeded = new Set<string>();

  constructor(
    private readonly workspace: WorkspaceConfigService,
    private readonly notifications: NotificationService,
    @Inject(COMMS_STORE) private readonly store: CommsStore,
    // The single mail write path. Mail is a facet of this context, so the legacy endpoint uses the
    // same persistence as MailService rather than a parallel one of its own.
    @Inject(MAIL_STORE) private readonly mail: MailStore,
    // Optional keeps the direct service harnesses and in-memory unit tests backwards-compatible;
    // the API application always supplies the registry from CoreModule.
    @Optional() private readonly users: UsersService | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
    @Optional() @Inject(ProjectService) private readonly projects: ProjectService | null = null,
    // WhatsApp is another Communication facet. Optional keeps the focused chat/mail harnesses
    // usable while the production module supplies the persisted store.
    @Optional() @Inject(WHATSAPP_STORE) private readonly whatsapp: WhatsAppStore | null = null,
    @Optional() private readonly events: EventBus | null = null,
  ) {}

  /**
   * Resolve the company-aware people directory used by DM creation and the picker.
   * Workspace assignments provide the role; the identity registry provides company and active
   * status. The union keeps an invited/registered person reachable even before a role is assigned.
   */
  private async directoryPeople(tenantId: string): Promise<DirectoryPerson[]> {
    // A few focused service harnesses provide only `get()`; derive the same lightweight directory
    // shape there rather than making an unrelated mock implement the whole workspace service.
    const workspaceUsers = this.workspace.users as unknown as ((id: string) => Promise<Array<{ username: string; roleLabel: string }>>) | undefined;
    const assigned = typeof workspaceUsers === 'function'
      ? await workspaceUsers.call(this.workspace, tenantId)
      : Object.entries((await this.workspace.get(tenantId)).assignments).map(([username, role]) => ({ username, roleLabel: String(role) }));
    if (this.users) await this.users.ensureTenant(tenantId);
    const registered = this.users?.list(tenantId) ?? [];
    const byId = new Map<string, DirectoryPerson>();
    for (const user of assigned) {
      const identity = registered.find((candidate) => candidate.userId === user.username);
      byId.set(user.username, {
        username: user.username,
        roleLabel: user.roleLabel,
        companyId: identity?.companyId ?? null,
        active: identity?.active !== false,
      });
    }
    for (const user of registered) {
      if (!byId.has(user.userId)) {
        byId.set(user.userId, {
          username: user.userId,
          roleLabel: 'Member',
          companyId: user.companyId,
          active: user.active,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.username.localeCompare(b.username));
  }

  /** Company from the verified request wins; otherwise use the registered caller assignment. */
  private async effectiveCompany(tenantId: string, username: string, companyId: string | null): Promise<string | null> {
    if (companyId) return companyId;
    if (this.users) {
      await this.users.ensureTenant(tenantId);
      return this.users.get(tenantId, username)?.companyId ?? null;
    }
    return null;
  }

  /** People the caller may start a private conversation with — never a client-side filter. */
  async people(tenantId: string, username: string, companyId: string | null = null): Promise<ChatPerson[]> {
    const people = await this.directoryPeople(tenantId);
    const effective = await this.effectiveCompany(tenantId, username, companyId);
    return people
      .filter((person) => person.username !== username && person.active)
      .filter((person) => !effective || person.companyId === effective)
      .map(({ active: _active, ...person }) => person);
  }

  /**
   * Assert the directory channels exist, once per process per tenant. `ensureChannels` is an
   * upsert, so this adds a channel a new department earned without touching the messages already
   * in the ones that existed — which is what makes a restart invisible to users.
   */
  private async channelsFor(tenantId: string): Promise<StoredChannel[]> {
    if (!this.seeded.has(tenantId)) {
      const config = await this.workspace.get(tenantId);
      const expected = defaultChannelsForDirectory(config.assignments);
      await this.store.ensureChannels(tenantId, expected, 'system');
      this.seeded.add(tenantId);
      this.logger.log(`Asserted ${expected.length} directory chat channels for ${tenantId}.`);
    }
    return this.store.listChannels(tenantId);
  }

  /** Project membership is an access grant, so it must be re-evaluated after team changes. */
  private async canAccessResolved(
    tenantId: string, channel: StoredChannel, username: string, isAdmin: boolean, companyId: string | null,
  ): Promise<boolean> {
    if (channel.kind !== 'project' || !this.access) return canAccessChannel(channel, username, isAdmin, companyId);
    if (channel.companyId !== null && channel.companyId !== companyId) return false;
    const projectId = channel.id.startsWith('ch-project-') ? channel.id.slice('ch-project-'.length) : null;
    if (!projectId) return canAccessChannel(channel, username, isAdmin, companyId);
    const members = new Set(
      this.access.listGrants()
        .filter((grant) => grant.scope.kind === 'resource'
          && grant.scope.resourceType === 'project'
          && grant.scope.resourceId === projectId)
        .map((grant) => grant.userId),
    );
    const project = this.projects ? await this.projects.get(projectId) : null;
    if (project?.ownerId) members.add(project.ownerId);
    return isAdmin || members.has(username);
  }

  /** Resolve notification recipients from the channel's current membership. */
  private async membersForChannel(tenantId: string, channel: StoredChannel): Promise<string[]> {
    if (channel.kind === 'company') {
      return (await this.directoryPeople(tenantId)).filter((person) => person.active).map((person) => person.username);
    }
    if (channel.kind === 'project' && this.access) {
      const projectId = channel.id.startsWith('ch-project-') ? channel.id.slice('ch-project-'.length) : null;
      if (projectId) {
        const members = new Set(
          this.access.listGrants()
            .filter((grant) => grant.scope.kind === 'resource'
              && grant.scope.resourceType === 'project'
              && grant.scope.resourceId === projectId)
            .map((grant) => grant.userId),
        );
        const project = this.projects ? await this.projects.get(projectId) : null;
        if (project?.ownerId) members.add(project.ownerId);
        return this.activeMembers(tenantId, [...members]);
      }
    }
    return this.activeMembers(tenantId, channel.members);
  }

  private async activeMembers(tenantId: string, members: string[]): Promise<string[]> {
    if (!this.users) return members;
    await this.users.ensureTenant(tenantId);
    return members.filter((member) => this.users?.get(tenantId, member)?.active !== false);
  }

  private preview(m: ChatMessage): string {
    if (m.kind === 'voice') return '🎤 Voice message';
    if (m.kind === 'file') return `📎 ${m.attachment?.name ?? 'Attachment'}`;
    return m.text.length > 80 ? `${m.text.slice(0, 77)}…` : m.text;
  }

  /** Channels the user can see, with unread counts — DMs appear once used. */
  async channels(tenantId: string, username: string, isAdmin: boolean, companyId: string | null = null): Promise<ChannelSummary[]> {
    const all = await this.channelsFor(tenantId);
    // One rule decides the list and the reads, so a channel can never be listed to someone who
    // would then be refused its messages — or worse, listed to someone who would not be.
    const visible = await Promise.all(all.map(async (channel) => ({
      channel,
      visible: await this.canAccessResolved(tenantId, channel, username, isAdmin, companyId),
    })));
    const withDms = visible.filter((entry) => entry.visible).map((entry) => entry.channel);
    return Promise.all(withDms.map(async (c) => {
      const msgs = await this.store.listMessages(tenantId, c.id);
      const last = msgs[msgs.length - 1] ?? null;
      return {
        ...c,
        unread: unreadChatCount(msgs, username, await this.store.getLastRead(tenantId, c.id, username)),
        lastMessageAt: last?.sentAt ?? null,
        lastPreview: last ? this.preview(last) : null,
      };
    }));
  }

  /**
   * Aggregate chat attachments without creating a second file store. Authorization is applied
   * before messages are read, so private DM attachments cannot leak through this listing.
   * Controlled documents remain owned by Document Control; these are inline chat attachments.
   */
  async files(
    tenantId: string, username: string, isAdmin: boolean, companyId: string | null = null,
  ): Promise<CommunicationFile[]> {
    const channels = (await this.channelsFor(tenantId));
    const visible = await Promise.all(channels.map(async (channel) => ({
      channel,
      visible: await this.canAccessResolved(tenantId, channel, username, isAdmin, companyId),
    })));
    const files: CommunicationFile[] = [];
    for (const { channel } of visible.filter((entry) => entry.visible)) {
      const messages = await this.store.listMessages(tenantId, channel.id);
      for (const message of messages) {
        if ((message.kind !== 'file' && message.kind !== 'voice') || !message.attachment) continue;
        files.push({
          id: message.id,
          channelId: channel.id,
          channelName: channel.name,
          sender: message.sender,
          kind: message.kind,
          name: message.attachment.name,
          mime: message.attachment.mime,
          size: message.attachment.size,
          dataUrl: message.attachment.dataUrl,
          sentAt: message.sentAt,
        });
      }
    }
    return files.sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 200);
  }

  /**
   * Build the user's unread worklist from the owning chat and mail stores. This is a projection,
   * not a new inbox: opening the linked chat or mail applies the authoritative read transition.
   */
  async unreadItems(
    tenantId: string, username: string, isAdmin: boolean, companyId: string | null = null,
  ): Promise<UnreadCommunication[]> {
    const items: UnreadCommunication[] = [];
    const channels = await this.channelsFor(tenantId);
    const visible = await Promise.all(channels.map(async (channel) => ({
      channel,
      visible: await this.canAccessResolved(tenantId, channel, username, isAdmin, companyId),
    })));
    for (const channel of channels) {
      if (!visible.find((entry) => entry.channel.id === channel.id)?.visible) continue;
      const messages = await this.store.listMessages(tenantId, channel.id);
      const lastRead = await this.store.getLastRead(tenantId, channel.id, username);
      const unread = messages.filter((message) => message.sender !== username && (!lastRead || message.sentAt > lastRead));
      const last = unread[unread.length - 1];
      if (last) {
        items.push({
          id: `chat:${channel.id}:${last.id}`,
          source: 'chat',
          title: channel.name,
          detail: `${displayName(last.sender)}: ${this.preview(last)}`,
          date: last.sentAt,
          channelId: channel.id,
          mailId: null,
          threadId: null,
        });
      }
    }
    const mailbox = await this.mailbox(tenantId, username);
    for (const mail of mailbox.inbox.filter((message) => !message.readBy.includes(username))) {
      items.push({
        id: `mail:${mail.id}`,
        source: 'mail',
        title: mail.subject,
        detail: `From ${displayName(mail.from)}`,
        date: mail.sentAt,
        channelId: null,
        mailId: mail.id,
        threadId: null,
      });
    }
    if (this.whatsapp) {
      const threads = await this.whatsapp.listThreads(tenantId, companyId, username);
      for (const thread of threads.filter((candidate) => candidate.unread > 0)) {
        items.push({
          id: `whatsapp:${thread.id}`,
          source: 'whatsapp',
          title: thread.displayName,
          detail: thread.lastPreview ?? thread.phone,
          date: thread.lastMessageAt ?? new Date(0).toISOString(),
          channelId: null,
          mailId: null,
          threadId: thread.id,
        });
      }
    }
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
  }

  /** Open (or create) the DM channel between two users. */
  async openDm(tenantId: string, me: string, peer: string, companyId: string | null = null): Promise<ChatChannel> {
    const target = peer.trim();
    if (!target || target === me) throw new NotFoundException('user not found');
    const people = await this.directoryPeople(tenantId);
    const effective = await this.effectiveCompany(tenantId, me, companyId);
    const peerRecord = people.find((person) => person.username === target);
    // In-memory direct-service harnesses historically used arbitrary principals. Keep that dev
    // fallback only when there is no identity registry and no company scope; a real API request is
    // backed by UsersService and therefore fails closed for unknown or inactive people.
    const registryKnown = (this.users?.list(tenantId).length ?? 0) > 0;
    if ((!peerRecord && (this.users || effective || registryKnown)) || peerRecord?.active === false
      || (effective && peerRecord?.companyId !== effective)) {
      throw new NotFoundException('user not found');
    }
    const id = dmChannelId(me, target);
    const existing = await this.store.getChannel(tenantId, id);
    if (existing) {
      if (!canAccessChannel(existing, me, false, effective)) throw new NotFoundException('user not found');
      return existing;
    }
    const channel: ChatChannel = { id, kind: 'dm', name: displayName(target), members: [me, target].sort() };
    await this.store.ensureChannels(tenantId, [channel], me, effective);
    return channel;
  }

  /** Open the shared conversation for a project's current delivery team. */
  async openProject(
    tenantId: string, username: string, projectId: string, isAdmin = false, companyId: string | null = null,
  ): Promise<ChatChannel> {
    if (!this.access || !this.projects) throw new NotFoundException('project not found');
    const project = await this.projects.get(projectId);
    if (!project || project.tenantId !== tenantId || (companyId && project.companyId && project.companyId !== companyId)) {
      throw new NotFoundException('project not found');
    }
    const members = new Set(
      this.access.listGrants()
        .filter((grant) => grant.scope.kind === 'resource'
          && grant.scope.resourceType === 'project'
          && grant.scope.resourceId === projectId)
        .map((grant) => grant.userId),
    );
    if (project.ownerId) members.add(project.ownerId);
    if (!isAdmin && !members.has(username)) throw new NotFoundException('project not found');

    const channel: ChatChannel = {
      id: `ch-project-${projectId}`,
      kind: 'project',
      name: project.title,
      members: [...members].sort(),
    };
    await this.store.ensureChannels(tenantId, [channel], username, project.companyId);
    return channel;
  }

  /** Create a named internal team conversation from active same-company colleagues. */
  async openTeam(
    tenantId: string, username: string, name: string, requestedMembers: string[], companyId: string | null = null,
  ): Promise<ChatChannel> {
    const title = name.trim();
    if (!title) throw new BadRequestException('team name is required');
    if (title.length > 80) throw new BadRequestException('team name must be 80 characters or fewer');
    const members = [...new Set([username, ...(Array.isArray(requestedMembers) ? requestedMembers : [])
      .map((member) => member.trim()).filter(Boolean)])];
    if (members.length < 2) throw new BadRequestException('select at least one colleague');
    if (members.length > 50) throw new BadRequestException('team conversations support up to 50 members');

    const people = await this.directoryPeople(tenantId);
    const effective = await this.effectiveCompany(tenantId, username, companyId);
    const registryKnown = (this.users?.list(tenantId).length ?? 0) > 0;
    for (const member of members) {
      if (member === username) continue;
      const person = people.find((candidate) => candidate.username === member);
      if (!person || !person.active || ((this.users || effective || registryKnown) && effective && person.companyId !== effective)) {
        throw new NotFoundException('person not found');
      }
    }
    const existing = (await this.store.listChannels(tenantId)).find((channel) => channel.kind === 'team' && channel.name === title);
    if (existing) {
      const sameMembers = existing.members.length === members.length && existing.members.every((member) => members.includes(member));
      if (sameMembers && existing.members.includes(username)) return existing;
      throw new ConflictException('team name already exists');
    }
    const channel: ChatChannel = { id: `team:${newId()}`, kind: 'team', name: title, members: members.sort() };
    await this.store.ensureChannels(tenantId, [channel], username, effective);
    return channel;
  }

  /**
   * The channel, if this caller may see it. Returns 404 rather than 403 for a channel they may
   * not: a distinct "forbidden" would confirm that a given DM exists between two named people,
   * which is itself the private fact. Same reason the workflow controller conceals out-of-scope
   * instances. Cross-tenant ids land here too — the store only ever reads within the tenant.
   */
  private async requireChannel(
    tenantId: string, username: string, channelId: string, isAdmin: boolean, companyId: string | null,
  ): Promise<StoredChannel> {
    await this.channelsFor(tenantId);
    const channel = await this.store.getChannel(tenantId, channelId);
    if (!channel || !(await this.canAccessResolved(tenantId, channel, username, isAdmin, companyId))) {
      throw new NotFoundException(`channel ${channelId} not found`);
    }
    return channel;
  }

  /** Messages in a channel (marks the channel read for the caller). */
  async messages(
    tenantId: string, username: string, channelId: string, isAdmin = false, companyId: string | null = null,
  ): Promise<ChatMessage[]> {
    const channel = await this.requireChannel(tenantId, username, channelId, isAdmin, companyId);
    const previousRead = await this.store.getLastRead(tenantId, channelId, username);
    const msgs = await this.store.listMessages(tenantId, channelId);
    await this.store.setLastRead(tenantId, channelId, username, new Date().toISOString());
    // A read receipt is a notification to the sender, but only for private DMs. Broadcasting
    // "Alice read your message" for a company room would create noise and disclose presence to an
    // audience that did not ask for receipts. The watermark makes this idempotent across polling.
    const peer = channel.kind === 'dm' ? dmPeer(channel.id, username) : null;
    if (peer) {
      const newlyRead = msgs.filter((message) => message.sender !== username && (!previousRead || message.sentAt > previousRead));
      if (peer && newlyRead.length > 0) {
        const count = newlyRead.length;
        await this.notifications.record({
          tenantId,
          userId: peer,
          title: `${displayName(username)} read your message`,
          body: `${displayName(username)} read ${count} message${count === 1 ? '' : 's'} in your private conversation.`,
          category: 'chat',
          refType: 'chat.read',
          refId: channel.id,
        });
      }
    }
    const peerReadAt = peer ? await this.store.getLastRead(tenantId, channelId, peer) : null;
    return msgs.map((message) => ({
      ...message,
      readByOtherAt: peer && message.sender === username && peerReadAt && message.sentAt <= peerReadAt
        ? peerReadAt
        : null,
    }));
  }

  async isChannelVisible(tenantId: string, username: string, channelId: string, isAdmin: boolean, companyId: string | null): Promise<boolean> {
    try { await this.requireChannel(tenantId, username, channelId, isAdmin, companyId); return true; } catch { return false; }
  }

  /** Post a message; notify every other member of the conversation. */
  async post(
    tenantId: string,
    input: NewChatMessage,
    companyId: string | null = null,
    isAdmin = false,
  ): Promise<ChatMessage | { error: string }> {
    // Write access is the same question as read access, asked before the message exists — this
    // also stops a post to an id that is not a channel at all creating a phantom conversation.
    const channel = await this.requireChannel(tenantId, input.sender, input.channelId, isAdmin, companyId);
    const result = makeChatMessage(input);
    if ('error' in result) return result;
    await this.store.addMessage(tenantId, companyId, result);
    await this.events?.publish(makeEvent({ type: 'comms.chat.message', tenantId, companyId, aggregateType: 'comms.chat.message', aggregateId: result.id, actorId: result.sender, payload: { channelId: result.channelId, messageId: result.id } }));
    // Your own message never counts as unread to you.
    await this.store.setLastRead(tenantId, result.channelId, input.sender, result.sentAt);
    await this.publishTimeline(tenantId, {
      id: newId(),
      companyId,
      occurredAt: result.sentAt,
      channel: 'chat',
      direction: 'internal',
      actor: result.sender,
      subjectType: 'message',
      subjectId: result.id,
      title: channel.name,
      preview: this.preview(result),
      // The channel decides who may read it, so the timeline carries that answer rather than
      // inventing a second one.
      visibility: 'channel',
      visibilityKey: result.channelId,
    });

    const recipients = await this.membersForChannel(tenantId, channel);
    const mentions = new Set(
      [...result.text.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((match) => match[1]).filter(Boolean),
    );
    for (const recipient of recipients.filter((member) => member !== input.sender)) {
      const mentioned = mentions.has(recipient);
      await this.notifications.record({
        tenantId,
        userId: recipient,
        title: mentioned
          ? `${displayName(input.sender)} mentioned you in ${channel.name}`
          : channel.kind === 'dm' ? `New message from ${displayName(input.sender)}` : `New message in ${channel.name}`,
        body: channel.kind === 'dm' ? this.preview(result) : `${displayName(input.sender)}: ${this.preview(result)}`,
        category: 'chat',
        refType: mentioned ? 'chat.mention' : 'chat.channel',
        refId: result.channelId,
      });
    }
    return result;
  }

  /** The user's mailbox (inbox + sent + unread). */
  async mailbox(tenantId: string, username: string): Promise<Mailbox> {
    // Reads follow the write: mail lives in the mail store now, and this projects it back to the
    // legacy MailMessage shape so /workspace and Communication see exactly what they saw before.
    const records = await this.mail.list(tenantId, { userId: username, limit: 200 });
    const sent = await this.mail.list(tenantId, { userId: username, folder: 'sent', limit: 200 });
    const projected = [...records, ...sent]
      .filter((mail, index, all) => all.findIndex((other) => other.id === mail.id) === index)
      .map((mail) => toLegacyMail(mail));
    return mailboxFor(projected, username);
  }

  /** Send internal mail — every recipient gets a notification. */
  async sendMail(tenantId: string, input: NewMail, companyId: string | null = null): Promise<MailMessage | { error: string }> {
    const result = makeMail(input);
    if ('error' in result) return result;
    // Delegated to THE mail write path (C3.1). The legacy endpoint keeps its old request and
    // response shape so /workspace and Communication are untouched, but the row it produces is
    // written exactly like one composed through MailService: canonical participants and the legacy
    // projection in one transaction. One writer per operation, not merely one per table.
    await this.mail.save(tenantId, {
      id: result.id,
      tenantId,
      companyId,
      accountId: null,
      direction: 'outbound',
      state: 'sent',
      fromUser: result.from,
      subject: result.subject,
      body: result.body,
      bodyHtml: null,
      snippet: result.body.length > 140 ? `${result.body.slice(0, 137)}…` : result.body,
      // Internal recipients are addressed by AURA user; no username is ever written as an address.
      participants: [
        { role: 'from', address: null, userId: result.from },
        ...result.to.map((username) => ({ role: 'to' as const, address: null, userId: username })),
      ],
      threadId: result.id,
      parentMailId: null,
      forwardedFromMailId: null,
      providerMessageId: null,
      providerThreadId: null,
      internetMessageId: null,
      inReplyTo: null,
      referencesHeader: null,
      sentAt: result.sentAt,
      failedReason: null,
      deliveryKey: null,
      deliveryStartedAt: null,
      deliveryAttempts: 0,
      createdAt: result.sentAt,
      updatedAt: result.sentAt,
    });
    await this.publishTimeline(tenantId, {
      id: newId(),
      companyId,
      occurredAt: result.sentAt,
      channel: 'mail',
      direction: 'outbound',
      actor: result.from,
      subjectType: 'mail',
      subjectId: result.id,
      title: result.subject,
      preview: result.body.length > 140 ? `${result.body.slice(0, 137)}…` : result.body,
      visibility: 'participants',
      visibilityKey: result.id,
    });
    for (const recipient of result.to) {
      if (recipient === result.from) continue;
      await this.notifications.record({
        tenantId,
        userId: recipient,
        title: `📧 Mail from ${displayName(result.from)}: ${result.subject}`,
        body: result.body.length > 120 ? `${result.body.slice(0, 117)}…` : result.body,
        category: 'mail',
        refType: 'mail.message',
        refId: result.id,
      });
    }
    return result;
  }

  async markMailRead(tenantId: string, username: string, mailId: string): Promise<void> {
    // Only sender and recipients can see a mail at all, so anyone else asking to mark it read is
    // probing for existence — concealed as a 404, like the channel reads.
    const mail = await this.mail.get(tenantId, mailId);
    const onEnvelope = mail?.participants.some((p) => p.userId === username) ?? false;
    if (!mail || (!onEnvelope && mail.fromUser !== username)) {
      throw new NotFoundException(`mail ${mailId} not found`);
    }
    await this.mail.markRead(tenantId, mailId, { userId: username }, new Date().toISOString());
  }

  /**
   * Index an activity on the Communication timeline.
   *
   * Failure here is logged, never thrown: the timeline is a projection, and losing a row from it
   * must not cost the user the message they actually sent. A dropped row is recoverable by
   * republishing from the owning record; a rejected send is not.
   */
  private async publishTimeline(tenantId: string, entry: TimelineEntry): Promise<void> {
    try {
      await this.store.publishTimeline(tenantId, entry);
    } catch (error) {
      this.logger.warn(`Timeline publish failed for ${entry.subjectType} ${entry.subjectId}: ${(error as Error).message}`);
    }
  }

  /** One badge feed for every Communication channel. Notifications remain a separate feed. */
  async unread(
    tenantId: string,
    username: string,
    isAdmin: boolean,
    companyId: string | null = null,
  ): Promise<{ chat: number; mail: number; whatsapp: number; total: number }> {
    const [summaries, box, whatsappThreads] = await Promise.all([
      this.channels(tenantId, username, isAdmin, companyId),
      this.mailbox(tenantId, username),
      this.whatsapp?.listThreads(tenantId, companyId, username) ?? Promise.resolve([]),
    ]);
    const chat = summaries.reduce((sum, c) => sum + c.unread, 0);
    const whatsapp = whatsappThreads.reduce((sum, thread) => sum + thread.unread, 0);
    return { chat, mail: box.unread, whatsapp, total: chat + box.unread + whatsapp };
  }
}
