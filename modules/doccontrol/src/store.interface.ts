import type { TxHandle } from '@aura/core';
import type { Transmittal } from './domain/transmittal';
import type { Correspondence } from './domain/correspondence';
import type { Submittal } from './domain/submittal';
import type { DrawingRegisterEntry } from './domain/drawing-register';

export interface DrawingRegisterStore {
  save(entry: DrawingRegisterEntry, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<DrawingRegisterEntry | null>;
  findByProject(projectId: string, tenantId: string): Promise<DrawingRegisterEntry[]>;
  findAll(tenantId: string): Promise<DrawingRegisterEntry[]>;
}

export interface TransmittalStore {
  save(transmittal: Transmittal, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Transmittal | null>;
  findByProject(projectId: string, tenantId: string): Promise<Transmittal[]>;
  findAll(tenantId: string): Promise<Transmittal[]>;
}

export interface CorrespondenceStore {
  save(correspondence: Correspondence, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Correspondence | null>;
  findByProject(projectId: string, tenantId: string): Promise<Correspondence[]>;
  findAll(tenantId: string): Promise<Correspondence[]>;
}

export interface SubmittalStore {
  save(submittal: Submittal, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<Submittal | null>;
  findByProject(projectId: string, tenantId: string): Promise<Submittal[]>;
  findAll(tenantId: string): Promise<Submittal[]>;
}

export const TRANSMITTAL_STORE = Symbol('TRANSMITTAL_STORE');
export const CORRESPONDENCE_STORE = Symbol('CORRESPONDENCE_STORE');
export const SUBMITTAL_STORE = Symbol('SUBMITTAL_STORE');
export const DRAWING_REGISTER_STORE = Symbol('DRAWING_REGISTER_STORE');
