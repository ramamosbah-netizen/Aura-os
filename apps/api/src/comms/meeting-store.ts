import type { Pool } from 'pg';
import { newId } from '@aura/shared';

export const MEETING_STORE = Symbol('MEETING_STORE');

export const MEETING_TYPES = ['internal_coordination', 'client', 'consultant', 'site', 'progress', 'technical', 'kickoff', 'handover'] as const;
export type MeetingType = typeof MEETING_TYPES[number];
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type MeetingItemKind = 'decision' | 'action';
export type MeetingItemStatus = 'open' | 'done' | 'cancelled';

export interface MeetingAttendee {
  userId?: string | null;
  address?: string | null;
  displayName: string;
  response?: 'pending' | 'accepted' | 'declined' | 'tentative';
}

export interface MeetingItem {
  id: string;
  kind: MeetingItemKind;
  title: string;
  detail: string | null;
  ownerId: string | null;
  dueAt: string | null;
  status: MeetingItemStatus;
  taskId: string | null;
  createdAt: string;
}

export interface Meeting {
  id: string;
  tenantId: string;
  companyId: string | null;
  title: string;
  meetingType: MeetingType;
  status: MeetingStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  onlineUrl: string | null;
  organizerId: string;
  attendees: MeetingAttendee[];
  relatedType: string | null;
  relatedId: string | null;
  relatedName: string | null;
  agenda: string | null;
  minutes: string | null;
  decisions: MeetingItem[];
  actionItems: MeetingItem[];
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewMeeting {
  tenantId: string;
  companyId: string | null;
  title: string;
  meetingType: MeetingType;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string | null;
  onlineUrl?: string | null;
  organizerId: string;
  attendees?: MeetingAttendee[];
  relatedType?: string | null;
  relatedId?: string | null;
  relatedName?: string | null;
  agenda?: string | null;
  createdBy: string;
}

export interface MeetingPatch {
  title?: string;
  meetingType?: MeetingType;
  status?: MeetingStatus;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  location?: string | null;
  onlineUrl?: string | null;
  attendees?: MeetingAttendee[];
  relatedType?: string | null;
  relatedId?: string | null;
  relatedName?: string | null;
  agenda?: string | null;
  minutes?: string | null;
}

export interface MeetingStore {
  list(tenantId: string, companyId: string | null): Promise<Meeting[]>;
  get(tenantId: string, id: string): Promise<Meeting | null>;
  create(input: NewMeeting): Promise<Meeting>;
  update(tenantId: string, id: string, patch: MeetingPatch): Promise<Meeting | null>;
  addItem(tenantId: string, meetingId: string, item: MeetingItem): Promise<Meeting | null>;
  updateItem(tenantId: string, meetingId: string, itemId: string, patch: Partial<MeetingItem>): Promise<Meeting | null>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class InMemoryMeetingStore implements MeetingStore {
  private readonly meetings = new Map<string, Meeting>();
  async list(tenantId: string, companyId: string | null): Promise<Meeting[]> {
    return [...this.meetings.values()]
      .filter((m) => m.tenantId === tenantId && (companyId === null || m.companyId === companyId))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(clone);
  }
  async get(tenantId: string, id: string) { const meeting = this.meetings.get(id); return meeting?.tenantId === tenantId ? clone(meeting) : null; }
  async create(input: NewMeeting) {
    const now = new Date().toISOString();
    const meeting: Meeting = { id: newId(), ...input, title: input.title.trim(), location: input.location?.trim() || null, onlineUrl: input.onlineUrl?.trim() || null, relatedType: input.relatedType ?? null, relatedId: input.relatedId ?? null, relatedName: input.relatedName?.trim() || null, agenda: input.agenda?.trim() || null, minutes: null, status: 'scheduled', attendees: input.attendees ?? [], decisions: [], actionItems: [], closedAt: null, createdAt: now, updatedAt: now };
    this.meetings.set(meeting.id, meeting); return clone(meeting);
  }
  async update(tenantId: string, id: string, patch: MeetingPatch) {
    const existing = await this.get(tenantId, id); if (!existing) return null;
    const updated = { ...existing, ...patch, title: patch.title?.trim() ?? existing.title, updatedAt: new Date().toISOString(), closedAt: patch.status === 'completed' ? new Date().toISOString() : existing.closedAt };
    this.meetings.set(id, updated); return clone(updated);
  }
  async addItem(tenantId: string, meetingId: string, item: MeetingItem) { const m = await this.get(tenantId, meetingId); if (!m) return null; const key = item.kind === 'decision' ? 'decisions' : 'actionItems'; const updated = { ...m, [key]: [...m[key], item], updatedAt: new Date().toISOString() }; this.meetings.set(m.id, updated); return clone(updated); }
  async updateItem(tenantId: string, meetingId: string, itemId: string, patch: Partial<MeetingItem>) { const m = await this.get(tenantId, meetingId); if (!m) return null; for (const key of ['decisions', 'actionItems'] as const) { const index = m[key].findIndex((item) => item.id === itemId); if (index >= 0) { const rows = [...m[key]]; rows[index] = { ...rows[index], ...patch }; const updated = { ...m, [key]: rows, updatedAt: new Date().toISOString() }; this.meetings.set(m.id, updated); return clone(updated); } } return clone(m); }
}

type MeetingRow = { id: string; tenant_id: string; company_id: string | null; title: string; meeting_type: MeetingType; status: MeetingStatus; starts_at: Date | string; ends_at: Date | string; timezone: string; location: string | null; online_url: string | null; organizer_id: string; related_type: string | null; related_id: string | null; related_name: string | null; agenda: string | null; minutes: string | null; attendees: unknown; decisions: unknown; action_items: unknown; closed_at: Date | string | null; created_by: string; created_at: Date | string; updated_at: Date | string };
const iso = (v: Date | string | null) => v ? (v instanceof Date ? v.toISOString() : new Date(v).toISOString()) : null;
const fromRow = (row: MeetingRow): Meeting => ({ id: row.id, tenantId: row.tenant_id, companyId: row.company_id, title: row.title, meetingType: row.meeting_type, status: row.status, startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString(), timezone: row.timezone, location: row.location, onlineUrl: row.online_url, organizerId: row.organizer_id, attendees: (row.attendees ?? []) as MeetingAttendee[], relatedType: row.related_type, relatedId: row.related_id, relatedName: row.related_name, agenda: row.agenda, minutes: row.minutes, decisions: (row.decisions ?? []) as MeetingItem[], actionItems: (row.action_items ?? []) as MeetingItem[], closedAt: iso(row.closed_at), createdBy: row.created_by, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! });

export class PostgresMeetingStore implements MeetingStore {
  constructor(private readonly pool: Pool) {}
  async list(tenantId: string, companyId: string | null) { const args: unknown[] = [tenantId]; let sql = 'select * from public.aura_comms_meetings where tenant_id=$1'; if (companyId !== null) { args.push(companyId); sql += ` and company_id=$${args.length}`; } sql += ' order by starts_at'; const result = await this.pool.query<MeetingRow>(sql, args); return result.rows.map(fromRow); }
  async get(tenantId: string, id: string) { const result = await this.pool.query<MeetingRow>('select * from public.aura_comms_meetings where tenant_id=$1 and id=$2', [tenantId, id]); return result.rows[0] ? fromRow(result.rows[0]) : null; }
  async create(input: NewMeeting) { const id = newId(); const result = await this.pool.query<MeetingRow>(`insert into public.aura_comms_meetings (id,tenant_id,company_id,title,meeting_type,status,starts_at,ends_at,timezone,location,online_url,organizer_id,related_type,related_id,related_name,agenda,attendees,decisions,action_items,created_by) values ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'[]'::jsonb,'[]'::jsonb,$17) returning *`, [id,input.tenantId,input.companyId,input.title.trim(),input.meetingType,input.startsAt,input.endsAt,input.timezone,input.location ?? null,input.onlineUrl ?? null,input.organizerId,input.relatedType ?? null,input.relatedId ?? null,input.relatedName ?? null,input.agenda ?? null,JSON.stringify(input.attendees ?? []),input.createdBy]); return fromRow(result.rows[0]); }
  async update(tenantId: string, id: string, patch: MeetingPatch) { const current = await this.get(tenantId, id); if (!current) return null; const merged = { ...current, ...patch }; const result = await this.pool.query<MeetingRow>(`update public.aura_comms_meetings set title=$3,meeting_type=$4,status=$5,starts_at=$6,ends_at=$7,timezone=$8,location=$9,online_url=$10,attendees=$11,related_type=$12,related_id=$13,related_name=$14,agenda=$15,minutes=$16,closed_at=case when $5='completed' then coalesce(closed_at,now()) else closed_at end,updated_at=now() where tenant_id=$1 and id=$2 returning *`, [tenantId,id,merged.title,merged.meetingType,merged.status,merged.startsAt,merged.endsAt,merged.timezone,merged.location,merged.onlineUrl,JSON.stringify(merged.attendees),merged.relatedType,merged.relatedId,merged.relatedName,merged.agenda,merged.minutes]); return result.rows[0] ? fromRow(result.rows[0]) : null; }
  async addItem(tenantId: string, meetingId: string, item: MeetingItem) { const m = await this.get(tenantId, meetingId); if (!m) return null; const key = item.kind === 'decision' ? 'decisions' : 'actionItems'; const rows = [...m[key], item]; const result = await this.pool.query<MeetingRow>(`update public.aura_comms_meetings set ${key === 'decisions' ? 'decisions' : 'action_items'}=$3,updated_at=now() where tenant_id=$1 and id=$2 returning *`, [tenantId,meetingId,JSON.stringify(rows)]); return result.rows[0] ? fromRow(result.rows[0]) : null; }
  async updateItem(tenantId: string, meetingId: string, itemId: string, patch: Partial<MeetingItem>) { const m = await this.get(tenantId, meetingId); if (!m) return null; for (const key of ['decisions', 'actionItems'] as const) { const index = m[key].findIndex((item) => item.id === itemId); if (index >= 0) { const rows = [...m[key]]; rows[index] = { ...rows[index], ...patch }; const result = await this.pool.query<MeetingRow>(`update public.aura_comms_meetings set ${key === 'decisions' ? 'decisions' : 'action_items'}=$3,updated_at=now() where tenant_id=$1 and id=$2 returning *`, [tenantId,meetingId,JSON.stringify(rows)]); return result.rows[0] ? fromRow(result.rows[0]) : null; } } return m; }
}
