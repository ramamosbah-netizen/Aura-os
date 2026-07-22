import { Body, Controller, Post } from '@nestjs/common';
import { estimateLine, type EstimationInput, type EstimationResult } from '@aura/shared';

/**
 * The Estimation Engine as a stateless service — give it a line's cost build-up and it returns the
 * full breakdown, unit cost, sell price and install duration. Stateless on purpose: the engine is a
 * pure calculation in `shared`, so this endpoint is only a thin, authoritative way for any surface
 * (the pricing workspace, tender estimation) to compute the same numbers the server would persist.
 */
@Controller('estimation')
export class EstimationController {
  @Post('line')
  estimate(@Body() input: EstimationInput): EstimationResult {
    return estimateLine(input ?? ({} as EstimationInput));
  }
}
