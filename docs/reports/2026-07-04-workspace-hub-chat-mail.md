# My Workspace hub — team chat, internal mail, unified personal page

**Date:** 2026-07-04 · **Branch:** `feat/workspace-hub` (off merged main) · **Commit:** `4ce278a`

Requirement: "Workspace should be a single page including Inbox / Search / Saved Views /
Notifications, and internal chat (company or department groups + one-to-one, with document
share and voice), user can send mails, gets a notification when mail arrives — notifications
active for everything."

## What shipped

**`/workspace` — one page, six tabs** (old routes `/inbox` `/search` `/views` `/notifications`
**redirect** into the matching tab; sidebar Workspace group is now `My Work` + `My Workspace`):

| Tab | Contents | Verified |
|-----|----------|----------|
| 💬 Chat | Company channel + department channels (seeded from the workspace directory roles: Leadership/Finance/Procurement/Projects/Operations/HR) + 1:1 DMs via "＋ New" user picker. Text, 📎 document share (≤5 MB), 🎤 voice notes (MediaRecorder → playable `<audio>`). Unread badges, last-message previews, 4 s polling. | Sent text/file/voice via API + browser UI; finance sees only company+Finance+own DMs |
| 📧 Mail | Compose (recipient chips from directory, subject, body), Inbox/Sent folders, read tracking, unread badge. | admin→finance mail landed; unread=1; open marks read |
| ◉ Inbox | Approvals inbox (module-grouped, action pills) — same data as before. | renders |
| 🔔 Notifications | Every chat DM + every mail raises a notification (categories `chat`/`mail`, colored chips) alongside existing spine-event ones; mark one / mark all read; 10 s polling. | 4 notifications raised by the test flow, visible in UI |
| ★ Saved Views | list + delete. | renders |
| ⌕ Search | client-side global search, grouped hits; `/search?q=` deep-links preserved. | redirect carries `q` |

## Architecture

- `shared/src/comms/model.ts` — framework-free: channel seeding from directory,
  DM ids, visibility (`visibleChannels`), message/mail validation + factories, unread math,
  mailbox split. **7 new unit tests, 129 total green.**
- `apps/api/src/comms/` — `CommsService` (tenant-scoped in-memory store, seeded on first use
  from `WorkspaceConfigService`) + `CommsController`: `GET/POST channels/:id/messages`,
  `POST dm`, `GET/POST mail`, `POST mail/:id/read`, `GET unread`. Identity = JWT `sub`
  (same pattern as `/workspace/me`).
- Notifications reuse the kernel `NotificationService` — external email/SMS/Slack/Teams
  delivery activates via the existing `SMTP_RELAY_URL`/webhook envs when configured.
- 7 web BFF routes under `/api/comms/*` + `/api/notifications` (list, for polling).
- `workspace-hub-client.tsx` — single client component; badges poll every 10 s, open
  conversation every 4 s.

## Gates

shared/api/web builds green · 129/129 tests · eslint clean · zero browser console errors ·
live-verified on worktree stack (API :4100, preview web :3100) incl. browser send.

## Known limits (deliberate)

- Chat/mail store is in-memory (dev parity with other module stores); PG table is the next
  persistence step if wanted.
- Notification list is tenant-scoped (pre-existing center design), so users currently see
  tenant-wide notifications; per-user filtering is a small follow-up (`userId` is already
  recorded on each notification).
- Group-channel messages notify via unread badges only (DM + mail raise notification-center
  entries) to avoid noise.
