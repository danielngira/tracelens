import { describe, expect, it } from 'vitest';
import { Metrics } from './metrics.js';

describe('Metrics', () => {
  it('summarizes query timing and pool usage', () => {
    const metrics = new Metrics();
    metrics.activeRequests = 2;
    metrics.recordQuery(4);
    metrics.recordQuery(8);

    expect(metrics.snapshot({ totalCount: 5, idleCount: 3, waitingCount: 1 })).toEqual({
      activeRequests: 2,
      pool: { total: 5, idle: 3, waiting: 1 },
      query: { count: 2, averageMs: 6, lastMs: 8 },
    });
  });
});
