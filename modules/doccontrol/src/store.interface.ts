import type { TxHandle } from '@aura/core';
import type { Page, PageParams } from '@aura/shared';
import type { Transmittal } from './domain/transmittal';
import type { TransmittalAcknowledgement } from './domain/transmittal-acknowledgement';
import type { DocumentRevision } from './domain/document-revision';
import type { Correspondence } from './domain/correspondence';
import type { Submittal } from './domain/submittal';
import type { DrawingRegisterEntry } from './domain/drawing-register';
import type { TransmittalItem } from './domain/transmittal-item';

/** Tenant-wide doc list filter; project_id narrows to a single project's documents. */
export interface DocListFilter {
  tenantId?: string;
  projectId?: string;
}

export interface DrawingRegisterStore {
  save(entry: DrawingRegisterEntry, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<DrawingRegisterEntry | null>;
  findByProject(projectId: string, tenantId: string): Promise<DrawingRegisterEntry[]>;
  findAll(tenantId: string): Promise<DrawingRegisterEntry[]>;
  listPaged(filter: DocListFilter, page: PageParams): Promise<Page<DrawingRegisterEntry>>;
}

export interface TransmittalStore {
  save(transmittal: Transmittal, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Transmittal | null>;
  findByProject(projectId: string, tenantId: string): Promise<Transmittal[]>;
  findAll(tenantId: string): Promise<Transmittal[]>;
  listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Transmittal>>;
}

export interface CorrespondenceStore {
  save(correspondence: Correspondence, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Correspondence | null>;
  findByProject(projectId: string, tenantId: string): Promise<Correspondence[]>;
  findAll(tenantId: string): Promise<Correspondence[]>;
  listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Correspondence>>;
}

export interface SubmittalStore {
  save(submittal: Submittal, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Submittal | null>;
  findByProject(projectId: string, tenantId: string): Promise<Submittal[]>;
  findAll(tenantId: string): Promise<Submittal[]>;
  listPaged(filter: DocListFilter, page: PageParams): Promise<Page<Submittal>>;
}

export interface DocumentRevisionStore {
  save(rev: DocumentRevision, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<DocumentRevision | null>;
  /** All revisions of a register entry, newest first (the immutable revision history). */
  listByRegisterEntry(registerEntryId: string, tenantId: string): Promise<DocumentRevision[]>;
  /**
   * Every ISSUED revision in a project that has content behind it.
   *
   * One query rather than a revision read per register entry: a dossier asks about a whole
   * project's documents at once, and the answer it needs is narrow — which document number,
   * at which revision, has a file the client can actually be given.
   *
   * ISSUED only. A drawing that is approved but not issued has not been released, and a
   * handover pack that offered it for download would be handing over something document
   * control has not let out.
   */
  listIssuedContentByProject(
    projectId: string,
    tenantId: string,
  ): Promise<Array<{ registerEntryId: string; revision: string; dmsDocumentId: string }>>;
}

export interface TransmittalAcknowledgementStore {
  save(ack: TransmittalAcknowledgement, tx?: TxHandle): Promise<void>;
  listByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalAcknowledgement[]>;
}

export interface TransmittalItemStore {
  save(item: TransmittalItem, tx?: TxHandle): Promise<void>;
  findByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalItem[]>;
  findByRegisterEntry(registerEntryId: string, tenantId: string): Promise<TransmittalItem[]>;
}

export const TRANSMITTAL_STORE = Symbol('TRANSMITTAL_STORE');
export const TRANSMITTAL_ITEM_STORE = Symbol('TRANSMITTAL_ITEM_STORE');
export const TRANSMITTAL_ACK_STORE = Symbol('TRANSMITTAL_ACK_STORE');
export const DOCUMENT_REVISION_STORE = Symbol('DOCUMENT_REVISION_STORE');
export const CORRESPONDENCE_STORE = Symbol('CORRESPONDENCE_STORE');
export const SUBMITTAL_STORE = Symbol('SUBMITTAL_STORE');
export const DRAWING_REGISTER_STORE = Symbol('DRAWING_REGISTER_STORE');
