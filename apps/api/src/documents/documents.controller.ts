import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { Document, DocumentVersion } from '@aura/shared';
import { DmsService, type DocumentWithVersions, TenantContext } from '@aura/core';

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

  @Post()
  create(@Body() dto: CreateDocumentDto): Promise<DocumentWithVersions> {
    const ctx = this.tenant.get();
    return this.dms.createDocument(
      {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        kind: dto.kind,
        title: dto.title,
        aggregateType: dto.aggregateType,
        aggregateId: dto.aggregateId,
        createdBy: ctx.actorId,
      },
      {
        fileName: dto.fileName ?? `${dto.title}.txt`,
        contentType: dto.contentType ?? 'text/plain',
        data: Buffer.from(dto.content ?? '', 'utf8'),
      },
    );
  }

  @Post(':id/versions')
  addVersion(@Param('id') id: string, @Body() dto: AddVersionDto): Promise<DocumentVersion> {
    return this.dms.addVersion(
      id,
      {
        fileName: dto.fileName ?? 'revision.txt',
        contentType: dto.contentType ?? 'text/plain',
        data: Buffer.from(dto.content ?? '', 'utf8'),
      },
      dto.note,
    );
  }

  @Get()
  list(@Query('kind') kind?: string, @Query('aggregateId') aggregateId?: string): Promise<Document[]> {
    return this.dms.list({ kind, aggregateId, limit: 100 });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<DocumentWithVersions> {
    const found = await this.dms.get(id);
    if (!found) throw new NotFoundException(`document ${id} not found`);
    return found;
  }
}
