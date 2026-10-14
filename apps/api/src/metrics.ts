export type MetricsSnapshot = {
  activeRequests: number;
  pool: { total: number; idle: number; waiting: number };
  query: { count: number; averageMs: number; lastMs: number };
};

export class Metrics {
  activeRequests = 0;
  private queryCount = 0;
  private queryTotalMs = 0;
  private lastQueryMs = 0;

  recordQuery(durationMs: number) {
    this.queryCount += 1;
    this.queryTotalMs += durationMs;
    this.lastQueryMs = durationMs;
  }

  snapshot(pool: { totalCount: number; idleCount: number; waitingCount: number }): MetricsSnapshot {
    return {
      activeRequests: this.activeRequests,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      query: {
        count: this.queryCount,
        averageMs: this.queryCount ? this.queryTotalMs / this.queryCount : 0,
        lastMs: this.lastQueryMs,
      },
    };
  }
}
