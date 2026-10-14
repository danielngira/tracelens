import { describe, expect, it } from 'vitest';
import { compareRuns, RunAccumulator, summarizeRun } from './runResults.js';

describe('run result calculations', () => {
  it('calculates percentiles, rate, errors, and per-second chart points', () => {
    const { summary, series } = summarizeRun([
      { elapsedSeconds: 0.1, durationMs: 10, failed: false },
      { elapsedSeconds: 0.8, durationMs: 20, failed: true },
      { elapsedSeconds: 1.2, durationMs: 30, failed: false },
      { elapsedSeconds: 1.6, durationMs: 40, failed: false },
    ], 2);
    expect(summary).toEqual({ requests: 4, requestsPerSecond: 2, errorRate: 0.25, p50: 20, p95: 40, p99: 40 });
    expect(series.map(point => [point.second, point.requestsPerSecond])).toEqual([[0, 2], [1, 2]]);
  });

  it('compares performance summaries with signed changes', () => {
    const changes = compareRuns(
      { p95: 100, requestsPerSecond: 20, errorRate: 0.01, requests: 100, p50: 50, p99: 150 },
      { p95: 80, requestsPerSecond: 25, errorRate: 0, requests: 125, p50: 40, p99: 120 },
    );
    expect(changes.p95).toEqual({ absolute: -20, percent: -20 });
    expect(changes.requestsPerSecond).toEqual({ absolute: 5, percent: 25 });
    expect(changes.errorRate).toEqual({ absolute: -0.01, percent: -100 });
  });

  it('builds charts from streamed samples and uses k6 aggregate percentiles', () => {
    const run = new RunAccumulator(10);
    run.add('http_req_duration', '2026-10-14T18:00:00.100Z', 10);
    run.add('http_req_failed', '2026-10-14T18:00:00.100Z', 0);
    run.add('http_req_duration', '2026-10-14T18:00:00.800Z', 20);
    run.add('http_req_failed', '2026-10-14T18:00:00.800Z', 1);
    run.add('http_req_duration', '2026-10-14T18:00:01.100Z', 30);
    run.add('http_req_failed', '2026-10-14T18:00:01.100Z', 0);

    const result = run.finish({ metrics: {
      http_reqs: { values: { count: 3, rate: 1.5 } },
      http_req_failed: { values: { rate: 1 / 3 } },
      http_req_duration: { values: { med: 20, 'p(95)': 30, 'p(99)': 30 } },
    } }, 2);

    expect(result.summary).toEqual({ requests: 3, requestsPerSecond: 1.5, errorRate: 1 / 3, p50: 20, p95: 30, p99: 30 });
    expect(result.series.map(point => [point.second, point.requestsPerSecond])).toEqual([[0, 2], [1, 1]]);
  });
});
