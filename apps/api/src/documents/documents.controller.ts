import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, StreamableFile } from '@nestjs/common';
import type {
  Document,
  DocumentActor,
  DocumentPermission,
  DocumentPermissionLevel,
  DocumentSubjectType,
  DocumentVersion,
} from '@aura/shared';
import {
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

  /** Only what the caller may see — filtering happens in the service, not here. */
  @Get()
  list(@Query('kind') kind?: string, @Query('aggregateId') aggregateId?: string): Promise<Document[]> {
    return this.dms.listFor({ kind, aggregateId, limit: 100 }, this.actor());
  }

  /** Documents other people have shared with the caller. */
  @Get('shared-with-me')
  sharedWithMe(): Promise<Array<{ document: Document; permissions: DocumentPermission[] }>> {
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
  ): Promise<StreamableFile> {
    // DOWNLOAD is checked inside the service, against the document — the bytes are no longer
    // reachable by holding a storage key.
    try {
      const { bytes, version: v } = await this.dms.downloadVersion(
        id,
        version ? Number(version) : null,
        this.actor(),
      );
      return new StreamableFile(bytes, {
        type: v.contentType,
        disposition: `attachment; filename="${v.fileName.replace(/"/g, '')}"`,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'DocumentAccessDeniedError') throw err;
      throw new NotFoundException(`content for document ${id} is not in storage`);
    }
  }
}
