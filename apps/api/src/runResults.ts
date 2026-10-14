export type Sample = { elapsedSeconds: number; durationMs: number; failed: boolean };
export type RunSummary = { requests: number; requestsPerSecond: number; errorRate: number; p50: number; p95: number; p99: number };
export type RunPoint = { second: number; requestsPerSecond: number; p50: number; p95: number; p99: number };
export type K6Summary = { metrics?: {
  http_reqs?: { values?: { count?: number; rate?: number } };
  http_req_failed?: { values?: { rate?: number } };
  http_req_duration?: { values?: { med?: number; 'p(95)'?: number; 'p(99)'?: number } };
} };

type Bucket = { requests: number; durations: number[] };

/** Keeps exact counts but bounds latency samples while k6's NDJSON file is streamed. */
export class RunAccumulator {
  private readonly buckets = new Map<number, Bucket>();
  private requests = 0;
  private failed = 0;
  private firstSecond: number | undefined;

  constructor(private readonly sampleLimitPerSecond = 2048) {}

  add(metric: string, time: string, value: number): void {
    if (metric === 'http_req_failed') {
      if (value > 0) this.failed += 1;
      return;
    }
    if (metric !== 'http_req_duration' || !Number.isFinite(value)) return;

    const timestamp = Date.parse(time);
    if (!Number.isFinite(timestamp)) return;
    const absoluteSecond = Math.floor(timestamp / 1000);
    this.firstSecond = this.firstSecond === undefined ? absoluteSecond : Math.min(this.firstSecond, absoluteSecond);
    this.requests += 1;

    const bucket = this.buckets.get(absoluteSecond) ?? { requests: 0, durations: [] };
    bucket.requests += 1;
    if (bucket.durations.length < this.sampleLimitPerSecond) {
      bucket.durations.push(value);
    } else {
      const replaceAt = Math.floor(Math.random() * bucket.requests);
      if (replaceAt < this.sampleLimitPerSecond) bucket.durations[replaceAt] = value;
    }
    this.buckets.set(absoluteSecond, bucket);
  }

  finish(k6: K6Summary, durationSeconds: number): { summary: RunSummary; series: RunPoint[] } {
    const metrics = k6.metrics ?? {};
    const duration = metrics.http_req_duration?.values ?? {};
    const requestCount = metrics.http_reqs?.values?.count ?? this.requests;
    const failureRate = metrics.http_req_failed?.values?.rate ?? (this.requests ? this.failed / this.requests : 0);
    const firstSecond = this.firstSecond ?? 0;
    const series = [...this.buckets.entries()].sort(([a], [b]) => a - b).map(([second, bucket]) => ({
      second: second - firstSecond,
      requestsPerSecond: bucket.requests,
      p50: percentile(bucket.durations, 0.5),
      p95: percentile(bucket.durations, 0.95),
      p99: percentile(bucket.durations, 0.99),
    }));

    return {
      summary: {
        requests: requestCount,
        requestsPerSecond: metrics.http_reqs?.values?.rate ?? (durationSeconds > 0 ? requestCount / durationSeconds : 0),
        errorRate: failureRate,
        p50: duration.med ?? 0,
        p95: duration['p(95)'] ?? 0,
        p99: duration['p(99)'] ?? 0,
      },
      series,
    };
  }
}

export function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

export function summarizeRun(samples: Sample[], durationSeconds: number): { summary: RunSummary; series: RunPoint[] } {
  const durations = samples.map(sample => sample.durationMs);
  const failed = samples.filter(sample => sample.failed).length;
  const summary: RunSummary = {
    requests: samples.length,
    requestsPerSecond: durationSeconds > 0 ? samples.length / durationSeconds : 0,
    errorRate: samples.length ? failed / samples.length : 0,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
  };
  const buckets = new Map<number, Sample[]>();
  for (const sample of samples) {
    const second = Math.floor(sample.elapsedSeconds);
    const bucket = buckets.get(second) ?? [];
    bucket.push(sample);
    buckets.set(second, bucket);
  }
  const series = [...buckets.entries()].sort(([a], [b]) => a - b).map(([second, bucket]) => ({
    second,
    requestsPerSecond: bucket.length,
    p50: percentile(bucket.map(item => item.durationMs), 0.5),
    p95: percentile(bucket.map(item => item.durationMs), 0.95),
    p99: percentile(bucket.map(item => item.durationMs), 0.99),
  }));
  return { summary, series };
}

export function compareRuns(a: RunSummary, b: RunSummary) {
  const delta = (left: number, right: number) => ({ absolute: right - left, percent: left === 0 ? null : ((right - left) / left) * 100 });
  return {
    p95: delta(a.p95, b.p95),
    requestsPerSecond: delta(a.requestsPerSecond, b.requestsPerSecond),
    errorRate: delta(a.errorRate, b.errorRate),
  };
}
