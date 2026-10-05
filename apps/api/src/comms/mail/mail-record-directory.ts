import type { MailRecordType } from './mail-domain';

/**
 * What Communication needs to know about a business record to link a message to it (MAIL-03…07):
 * whether it exists in this tenant, and what it is called. Nothing more — Communication does not
 * read other modules' tables (ADR-0004), so it asks, and the composition root answers through each
 * owning module's own service.
 */
export const MAIL_RECORD_DIRECTORY = Symbol('MAIL_RECORD_DIRECTORY');

export interface MailRecordDirectory {
  /** The record's name or title when it exists in this tenant; null when it does not. */
  labelOf(tenantId: string, recordType: MailRecordType, recordId: string): Promise<string | null>;
}

/**
 * The permission that reads each kind of record — the one its own GET route requires. Linking a
 * message to a record, and reading a record's correspondence, both need it: a link must not become a
 * way to learn that a record you may not read exists.
 */
export const RECORD_READ_PERMISSION: Readonly<Record<MailRecordType, string>> = {
  'crm.account': 'crm.account.read',
  'crm.contact': 'crm.contact.read',
  'crm.lead': 'crm.lead.read',
  'crm.opportunity': 'crm.opportunity.read',
  'tendering.tender': 'tendering.tender.read',
  'procurement.supplier': 'procurement.supplier.read',
  'projects.project': 'projects.project.read',
};
