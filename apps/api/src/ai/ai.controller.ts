import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AiCompletionResult } from '@aura/shared';
import { AiService } from '@aura/core';

interface CompleteDto {
  prompt: string;
  system?: string;
}

/**
 * Exposes the kernel AI seam over HTTP for the web shell's AI dock. The web app
 * proxies to this server-side (BFF), so the browser never holds the model key.
 */
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('provider')
  provider(): { provider: string } {
    return { provider: this.ai.activeProvider };
  }

  @Post('complete')
  complete(@Body() dto: CompleteDto): Promise<AiCompletionResult> {
    return this.ai.complete({
      system: dto.system,
      messages: [{ role: 'user', content: dto.prompt ?? '' }],
    });
  }
}
