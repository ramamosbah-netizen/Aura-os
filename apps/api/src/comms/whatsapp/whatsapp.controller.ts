import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Sse } from '@nestjs/common';
import { EventBus, Permissions, TenantContext } from '@aura/core';
import { Observable } from 'rxjs';
import { WhatsAppService } from './whatsapp.service';

const DEV_USER = process.env.WORKSPACE_DEV_USER ?? 'u-admin';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService, private readonly tenant: TenantContext, private readonly events: EventBus) {}

  @Get('webhook')
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string): string {
    const result = this.whatsapp.verify({ mode, token, challenge });
    if (!result) throw new BadRequestException('WhatsApp webhook verification failed');
    return result;
  }

  @Post('webhook')
  async webhook(@Req() req: { rawBody?: Buffer }, @Headers('x-hub-signature-256') signature: string | undefined, @Body() body: unknown) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.whatsapp.webhook(raw, body as never, signature);
  }

  private caller() { const ctx = this.tenant.get(); return { tenantId: ctx.tenantId, companyId: ctx.companyId ?? null, username: ctx.actorId ?? DEV_USER }; }

  @Get('threads')
  @Permissions('comms.channel.read')
  threads() { const c = this.caller(); return this.whatsapp.threads(c.tenantId, c.companyId, c.username); }

  @Get('threads/:id/messages')
  @Permissions('comms.channel.read')
  messages(@Param('id') id: string) { const c = this.caller(); return this.whatsapp.messages(c.tenantId, c.companyId, id); }

  @Post('threads/:id/reply')
  @Permissions('comms.channel.send')
  reply(@Param('id') id: string, @Body() body: { text?: string }) { const c = this.caller(); return this.whatsapp.reply(c.tenantId, c.companyId, c.username, id, body?.text ?? ''); }

  @Post('threads/:id/read')
  @Permissions('comms.channel.read')
  async read(@Param('id') id: string) { const c = this.caller(); await this.whatsapp.markRead(c.tenantId, c.companyId, id); return { ok: true }; }

  @Post('threads/:id/link')
  @Permissions('comms.channel.send')
  async link(@Param('id') id: string, @Body() body: { contactId?: string | null; accountId?: string | null; ownerId?: string | null }) { const c = this.caller(); const row = await this.whatsapp.link(c.tenantId, id, body ?? {}); if (!row) throw new BadRequestException('WhatsApp conversation not found'); return row; }

  @Get('status')
  @Permissions('comms.channel.read')
  status() { return { configured: this.whatsapp.configured() }; }

  @Sse('stream')
  @Permissions('comms.channel.read')
  stream(): Observable<{ data: unknown; type: string }> {
    const tenantId = this.tenant.get().tenantId;
    return new Observable((subscriber) => {
      const unsubscribe = this.events.subscribe('*', (event) => {
        if (event.tenantId !== tenantId || !event.type.startsWith('comms.whatsapp.')) return;
        subscriber.next({ type: 'whatsapp', data: event.payload });
      });
      const heartbeat = setInterval(() => subscriber.next({ type: 'heartbeat', data: { at: new Date().toISOString() } }), 25_000);
      return () => { unsubscribe(); clearInterval(heartbeat); };
    });
  }
}
