import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Optional, Param, Post, Query, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import type {
  Document,
  DocumentActor,
  DocumentPermission,
  DocumentPermissionLevel,
  DocumentSubjectType,
  DocumentVersion,
} from '@aura/shared';
import { resolveDocumentIdentity, type DocumentIdentity } from '../common/document-identity';
import { buildWorkbook, exportedAt, typedCell, type WorkbookColumn, type WorkbookColumnType } from '../common/workbook';
import {
  CompaniesService,
  Permissions,
  SettingsService,
  DmsService,
  type AccessDecision,
  type DocumentWithVersions,
  ParseUuidOr404Pipe,
  TenantContext,
} from '@aura/core';

interface CreateDocumentDto {
  kind: string;
  title: string;
  aggregateType: string;
  aggregateId: string;
  /** Phase-0 demo: inline text content. Real uploads use multipart later. */
  content?: string;
  fileName?: string;
  contentType?: string;
}

interface AddVersionDto {
  content?: string;
  fileName?: string;
  contentType?: string;
  note?: string;
}

interface WorkbookRequest {
  title?: string;
  filename?: string;
  columns?: Array<{ key: string; label?: string; type?: string; total?: boolean }>;
  rows?: Array<Record<string, unknown>>;
  filters?: Array<[string, string]>;
}

const WORKBOOK_TYPES = new Set<WorkbookColumnType>(['text', 'number', 'integer', 'money', 'percent', 'date', 'datetime', 'boolean']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * A column's type, read from its values when the screen did not say: numbers stay numbers, ISO
 * dates and instants become dates, yes/no stays yes/no — and anything mixed stays text, because a
 * guessed number is worse than an honest string.
 */
function inferType(values: unknown[]): WorkbookColumnType {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (present.length === 0) return 'text';
  if (present.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'number';
  if (present.every((v) => typeof v === 'boolean')) return 'boolean';
  if (present.every((v) => typeof v === 'string' && ISO_DATE.test(v))) return 'date';
  if (present.every((v) => typeof v === 'string' && ISO_INSTANT.test(v) && typedCell('datetime', v)?.t === 'n')) return 'datetime';
  return 'text';
}

interface ShareDto {
  subjectType: DocumentSubjectType;
  subjectId: string;
  permission: DocumentPermissionLevel;
  expiresAt?: string | null;
}

/**
 * Phase-0 proof of the DMS substrate: POST /api/documents creates a versioned
 * document (bytes → storage, metadata → store, `dms.document.created` → spine).
 * Real modules attach documents from their own services via DmsService.
 */
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly dms: DmsService,
    private readonly tenant: TenantContext,
    // Explicit tokens: an @Optional() parameter typed as a union reflects as Object and is null.
    @Optional() @Inject(CompaniesService) private readonly companies: CompaniesService | null = null,
    @Optional() @Inject(SettingsService) private readonly settings: SettingsService | null = null,
  ) {}

  /**
   * Who is asking. Teams and roles come from the session context when it carries them;
   * an actor with neither still resolves correctly — they simply match fewer shares.
   */
  private actor(): DocumentActor {
    const ctx = this.tenant.get() as {
      tenantId: string;
      companyId?: string | null;
      actorId?: string | null;
      teamIds?: string[];
      roleIds?: string[];
    };
    return {
      userId: ctx.actorId ?? 'anonymous',
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? null,
      teamIds: ctx.teamIds ?? [],
      roleIds: ctx.roleIds ?? [],
    };
  }

  @Post()
  create(@Body() dto: CreateDocumentDto): Promise<DocumentWithVersions> {
    const ctx = this.tenant.get();
    // createdBy MUST be the same identity the access resolver will compare against. Stamping
    // ctx.actorId here while resolving `ctx.actorId ?? 'anonymous'` there meant a document
    // created without a bound session had createdBy=null and its own creator was never
    // recognised — ownership silently never applied.
    const actor = this.actor();
    return this.dms.createDocument(
      {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        kind: dto.kind,
        title: dto.title,
        aggregateType: dto.aggregateType,
        aggregateId: dto.aggregateId,
        createdBy: actor.userId,
      },
      {
        fileName: dto.fileName ?? `${dto.title}.txt`,
        contentType: dto.contentType ?? 'text/plain',
        data: Buffer.from(dto.content ?? '', 'utf8'),
      },
    );
  }

  @Post(':id/versions')
  addVersion(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AddVersionDto): Promise<DocumentVersion> {
    return this.dms.addVersion(
      id,
      {
        fileName: dto.fileName ?? 'revision.txt',
        contentType: dto.contentType ?? 'text/plain',
        data: Buffer.from(dto.content ?? '', 'utf8'),
      },
      this.actor(),
      dto.note,
    );
  }

  /**
   * WHO ISSUES A DOCUMENT (F-01): the identity of the company that owns the record being printed —
   * its legal name, TRN, address and contacts — resolved from that company's record and, only for
   * a tenant with one company, the organisation profile. It is the letterhead, not a secret, so any
   * reader of documents may ask. Declared before `:id`, which would otherwise claim the path.
   */
  @Get('issuer-identity')
  issuerIdentity(@Query('companyId') companyId?: string): Promise<DocumentIdentity> {
    if (!this.companies || !this.settings) throw new ServiceUnavailableException('Company identity is unavailable');
    return resolveDocumentIdentity(this.companies, this.settings, this.tenant.get().tenantId, companyId?.trim() || null);
  }

  /**
   * THE ROWS ON SCREEN, AS A NATIVE WORKBOOK (F-03). The registers' shared Excel button used to save
   * an HTML table as .xls. It now sends the rows it shows here and receives a real workbook — typed,
   * filtered, header frozen — whose "About this export" sheet says plainly that these are the rows
   * that were on screen, not necessarily the whole register. Nothing is read from any store: the
   * caller already holds the rows, so the permission is the reader's, not a new data grant.
   */
  @Permissions('documents.workbook.read')
  @Post('workbook')
  async workbook(@Body() dto: WorkbookRequest): Promise<StreamableFile> {
    const rows = Array.isArray(dto?.rows) ? dto.rows : [];
    const requested = Array.isArray(dto?.columns) ? dto.columns : [];
    if (rows.length > 20_000) throw new BadRequestException('A workbook from the screen may hold at most 20,000 rows');
    if (requested.length === 0 || requested.length > 80) throw new BadRequestException('A workbook requires between 1 and 80 columns');
    const columns: WorkbookColumn<Record<string, unknown>>[] = requested.map((c) => ({
      label: String(c.label ?? c.key).slice(0, 120),
      type: WORKBOOK_TYPES.has(c.type as WorkbookColumnType) ? (c.type as WorkbookColumnType) : inferType(rows.map((r) => r?.[c.key])),
      value: (row) => row?.[c.key],
      total: c.total === true,
    }));
    const ctx = this.tenant.get();
    const identity = this.companies && this.settings
      ? await resolveDocumentIdentity(this.companies, this.settings, ctx.tenantId, ctx.companyId ?? null)
      : null;
    const title = String(dto?.title ?? 'Export').slice(0, 120);
    return new StreamableFile(buildWorkbook(title, columns, rows, {
      title,
      source: `${title} — the rows on screen when exported`,
      completeness: `The ${rows.length} rows that were on screen when exported. This is what the page had loaded and filtered, which may not be the whole register.`,
      filters: Array.isArray(dto?.filters) ? dto.filters.slice(0, 20).map(([k, v]) => [String(k), String(v)] as [string, string]) : undefined,
      generatedAt: exportedAt(),
      generatedBy: ctx.actorId ?? 'unknown',
      issuer: identity?.configured ? [identity.legalName || identity.name, identity.trn ? `TRN ${identity.trn}` : ''].filter(Boolean) : undefined,
    }), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${(String(dto?.filename ?? 'export').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'export')}.xlsx"`,
    });
  }

  /** Only what the caller may see — filtering happens in the service, not here. */
  @Get()
  list(
    @Query('kind') kind?: string,
    @Query('aggregateType') aggregateType?: string,
    @Query('aggregateId') aggregateId?: string,
  ): Promise<Document[]> {
    // aggregateType alone answers "every document on any quotation", which is what a portfolio
    // readiness view needs — one call instead of one per record.
    return this.dms.listFor({ kind, aggregateType, aggregateId, limit: 200 }, this.actor());
  }

  /** Documents other people have shared with the caller. */
  @Get('shared-with-me')
  sharedWithMe(): Promise<Array<{
    document: Document;
    permissions: DocumentPermission[];
    currentVersionFile: Pick<DocumentVersion, 'version' | 'fileName' | 'contentType' | 'sizeBytes'>;
  }>> {
    return this.dms.sharedWithMe(this.actor());
  }

  @Get(':id')
  get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<DocumentWithVersions> {
    return this.dms.getFor(id, this.actor());
  }

  /** What the caller may do with this document — lets a UI render actions without guessing. */
  @Get(':id/access')
  access(@Param('id', ParseUuidOr404Pipe) id: string): Promise<AccessDecision> {
    return this.dms.access(id, this.actor());
  }

  /** Who else has access, for the who-can-see-this view. Requires VIEW. */
  @Get(':id/permissions')
  permissions(@Param('id', ParseUuidOr404Pipe) id: string): Promise<DocumentPermission[]> {
    return this.dms.listAccess(id, this.actor());
  }

  /** Share with a user, team, role or company. Requires SHARE on the document. */
  @Post(':id/share')
  share(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: ShareDto): Promise<DocumentPermission> {
    return this.dms.share(
      {
        tenantId: this.tenant.get().tenantId,
        documentId: id,
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        permission: dto.permission,
        expiresAt: dto.expiresAt ?? null,
      },
      this.actor(),
    );
  }

  /** Revoke one share. Requires SHARE — whoever may grant access may take it away. */
  @Delete(':id/permissions/:permissionId')
  async revokeShare(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('permissionId', ParseUuidOr404Pipe) permissionId: string,
  ): Promise<{ revoked: boolean }> {
    return { revoked: await this.dms.revokeShare(id, permissionId, this.actor()) };
  }

  /** Download a version's bytes (latest by default) — closes the metadata→content loop. */
  @Get(':id/content')
  async download(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Query('version') version?: string,
    @Query('inline') inline?: string,
  ): Promise<StreamableFile> {
    // DOWNLOAD is checked inside the service, against the document — the bytes are no longer
    // reachable by holding a storage key.
    try {
      const { bytes, version: v } = await this.dms.downloadVersion(
        id,
        version ? Number(version) : null,
        this.actor(),
      );
      // Inline rendering is intentionally limited to PDFs. A caller cannot turn an arbitrary
      // HTML/SVG upload into active same-origin content simply by adding `?inline=true`.
      const inlinePdf = inline === 'true' && v.contentType.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf';
      const safeFileName = v.fileName.replace(/[\r\n"]/g, '').slice(0, 255) || 'document';
      return new StreamableFile(bytes, {
        type: v.contentType,
        disposition: `${inlinePdf ? 'inline' : 'attachment'}; filename="${safeFileName}"`,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'DocumentAccessDeniedError') throw err;
      throw new NotFoundException(`content for document ${id} is not in storage`);
    }
  }
}
