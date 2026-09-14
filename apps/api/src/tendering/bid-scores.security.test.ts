import 'reflect-metadata';
import { PERMISSIONS_KEY } from '@aura/core';
import { describe, expect, it } from 'vitest';
import { BidScoresController } from './bid-scores.controller';

describe('Bid / No-Bid amendment authority', () => {
  it('requires a distinct governed amendment permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BidScoresController.prototype.amend)).toEqual([
      'tendering.bid-score.amend',
    ]);
  });
});
