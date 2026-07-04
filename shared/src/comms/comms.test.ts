import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  defaultChannelsForDirectory,
  displayName,
  dmChannelId,
  dmPeer,
  mailboxFor,
  makeChatMessage,
  makeMail,
  unreadChatCount,
  visibleChannels,
  type ChatMessage,
  type MailMessage,
} from './model';
import { defaultWorkspaceConfig } from '../workspace';

describe('comms — channels', () => {
  const channels = defaultChannelsForDirectory(defaultWorkspaceConfig().assignments);

  it('seeds a company channel plus a department channel per team', () => {
    expect(channels[0]).toMatchObject({ id: 'ch-company', kind: 'company' });
    const names = channels.map((c) => c.name);
    expect(names).toContain('Leadership');
    expect(names).toContain('Finance');
    expect(names).toContain('HR');
    // admin + executive share Leadership
    expect(channels.find((c) => c.name === 'Leadership')?.members).toEqual(['u-admin', 'u-ceo']);
  });

  it('gates department channels to members, company to everyone, admin to all', () => {
    const finance = visibleChannels(channels, 'u-finance', false).map((c) => c.name);
    expect(finance).toContain('All company');
    expect(finance).toContain('Finance');
    expect(finance).not.toContain('HR');
    expect(visibleChannels(channels, 'u-admin', true)).toHaveLength(channels.length);
  });

  it('builds order-independent DM ids and resolves the peer', () => {
    expect(dmChannelId('u-pm', 'u-admin')).toBe(dmChannelId('u-admin', 'u-pm'));
    expect(dmPeer(dmChannelId('u-admin', 'u-pm'), 'u-admin')).toBe('u-pm');
    expect(dmPeer('ch-company', 'u-admin')).toBeNull();
  });
});

describe('comms — messages', () => {
  it('rejects empty text and oversized attachments', () => {
    expect(makeChatMessage({ channelId: 'ch-company', sender: 'u-admin', kind: 'text', text: '  ' })).toMatchObject({
      error: expect.stringContaining('required'),
    });
    expect(
      makeChatMessage({
        channelId: 'ch-company',
        sender: 'u-admin',
        kind: 'file',
        attachment: { name: 'big.bin', mime: 'application/octet-stream', size: MAX_ATTACHMENT_BYTES + 1, dataUrl: 'data:x' },
      }),
    ).toMatchObject({ error: expect.stringContaining('limit') });
  });

  it('constructs voice + file messages and counts unread excluding own', () => {
    const voice = makeChatMessage({
      channelId: 'ch-company',
      sender: 'u-pm',
      kind: 'voice',
      attachment: { name: 'note.webm', mime: 'audio/webm', size: 1000, dataUrl: 'data:audio/webm;base64,AA' },
    }) as ChatMessage;
    expect(voice.attachment?.mime).toBe('audio/webm');
    const mine = makeChatMessage({ channelId: 'ch-company', sender: 'u-admin', kind: 'text', text: 'hi' }) as ChatMessage;
    expect(unreadChatCount([voice, mine], 'u-admin', null)).toBe(1);
    expect(unreadChatCount([voice, mine], 'u-admin', new Date(Date.now() + 60_000).toISOString())).toBe(0);
  });
});

describe('comms — mail', () => {
  it('validates recipients and splits mailboxes with unread', () => {
    expect(makeMail({ from: 'u-admin', to: [], subject: 'x' })).toMatchObject({ error: expect.stringContaining('recipient') });
    const m1 = makeMail({ from: 'u-admin', to: ['u-finance'], subject: 'Q3 close' }) as MailMessage;
    const m2 = makeMail({ from: 'u-finance', to: ['u-admin'], body: 'reply' }) as MailMessage;
    const financeBox = mailboxFor([m1, m2], 'u-finance');
    expect(financeBox.inbox.map((m) => m.id)).toEqual([m1.id]);
    expect(financeBox.sent.map((m) => m.id)).toEqual([m2.id]);
    expect(financeBox.unread).toBe(1); // m1 not read by finance yet
    expect(mailboxFor([m1, m2], 'u-admin').unread).toBe(1);
  });

  it('formats display names', () => {
    expect(displayName('u-finance')).toBe('Finance');
    expect(displayName('u-site')).toBe('Site');
  });
});
