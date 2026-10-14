export type Sample = { elapsedSeconds: number; durationMs: number; failed: boolean };
export type RunSummary = { requests: number; requestsPerSecond: number; errorRate: number; p50: number; p95: number; p99: number };
export type RunPoint = { second: number; requestsPerSecond: number; p50: number; p95: number; p99: number };

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
