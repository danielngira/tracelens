import cors from 'cors';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import { Pool } from 'pg';
import { Metrics } from './metrics.js';
import { summarizeRun, type Sample } from './runResults.js';

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://tracelens:tracelens@localhost:5432/tracelens',
  max: 10,
});
const metrics = new Metrics();
const execFileAsync = promisify(execFile);
let testRunning = false;

app.use(cors());
app.use(express.json());
app.use((_, res, next) => {
  metrics.activeRequests += 1;
  res.on('finish', () => { metrics.activeRequests -= 1; });
  next();
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/api/products/:code', async (req, res, next) => {
  const started = performance.now();
  try {
    const result = await pool.query(
      'SELECT id, code, name, category, price_cents FROM products WHERE code = $1',
      [req.params.code],
    );
    metrics.recordQuery(performance.now() - started);
    if (!result.rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/metrics', (_req, res) => res.json(metrics.snapshot(pool)));

app.get('/api/query-plan', async (_req, res, next) => {
  try {
    const result = await pool.query(
      'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, code, name, category, price_cents FROM products WHERE code = $1',
      ['P010000'],
    );
    const explain = result.rows[0]['QUERY PLAN'][0];
    res.json({
      nodeType: explain.Plan['Node Type'],
      indexName: explain.Plan['Index Name'] ?? null,
      relation: explain.Plan['Relation Name'] ?? null,
      planningMs: explain['Planning Time'],
      executionMs: explain['Execution Time'],
      sharedHitBlocks: explain.Plan['Shared Hit Blocks'] ?? 0,
      sharedReadBlocks: explain.Plan['Shared Read Blocks'] ?? 0,
    });
  } catch (error) { next(error); }
});

app.get('/api/scenarios', (_req, res) => {
  res.json([{ id: 'product-lookup', name: 'Product lookup', description: 'Look up a seeded product by code.', defaultCode: 'P010000' }]);
});

app.get('/api/settings', (_req, res) => res.json({ poolSize: pool.options.max }));

app.post('/api/settings', (req, res) => {
  const poolSize = Number(req.body?.poolSize);
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 50) return res.status(400).json({ error: 'Pool size must be an integer from 1 to 50.' });
  if (testRunning) return res.status(409).json({ error: 'Change settings after the current test finishes.' });
  pool.options.max = poolSize;
  res.json({ poolSize });
});

app.get('/api/runs', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id, created_at, scenario, virtual_users, duration_seconds, pool_size, summary, series FROM test_runs ORDER BY id DESC LIMIT 20');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/runs', async (req, res, next) => {
  const virtualUsers = Number(req.body?.virtualUsers);
  const durationSeconds = Number(req.body?.durationSeconds);
  if (!Number.isInteger(virtualUsers) || virtualUsers < 1 || virtualUsers > 100 || !Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 120) {
    return res.status(400).json({ error: 'Use 1–100 virtual users and a duration of 5–120 seconds.' });
  }
  if (testRunning) return res.status(409).json({ error: 'A test is already running.' });

  testRunning = true;
  const directory = await mkdtemp(join(tmpdir(), 'tracelens-'));
  const outputPath = join(directory, 'samples.json');
  try {
    await execFileAsync('k6', [
      'run', '--quiet', `--vus=${virtualUsers}`, `--duration=${durationSeconds}s`,
      `--out=json=${outputPath}`, join(process.cwd(), 'load/product-lookup.js'),
    ], { env: { ...process.env, TARGET_URL: 'http://127.0.0.1:4000' }, timeout: (durationSeconds + 30) * 1000, maxBuffer: 1024 * 1024 });
    const text = await readFile(outputPath, 'utf8');
    const records = text.split('\n').filter(Boolean).map(line => JSON.parse(line) as { metric: string; data: { time: string; value: number } });
    const requests = new Map<string, { time: number; durationMs?: number; failed?: boolean }>();
    for (const record of records) {
      const key = record.data.time;
      const entry = requests.get(key) ?? { time: Date.parse(key) };
      if (record.metric === 'http_req_duration') entry.durationMs = record.data.value;
      if (record.metric === 'http_req_failed') entry.failed = record.data.value > 0;
      requests.set(key, entry);
    }
    const complete = [...requests.values()].filter((sample): sample is { time: number; durationMs: number; failed: boolean } => sample.durationMs !== undefined);
    const start = complete[0]?.time ?? Date.now();
    const samples: Sample[] = complete.map(sample => ({ elapsedSeconds: (sample.time - start) / 1000, durationMs: sample.durationMs, failed: sample.failed ?? false }));
    const result = summarizeRun(samples, durationSeconds);
    const saved = await pool.query(
      'INSERT INTO test_runs (scenario, virtual_users, duration_seconds, pool_size, summary, series) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at, scenario, virtual_users, duration_seconds, pool_size, summary, series',
      ['product-lookup', virtualUsers, durationSeconds, pool.options.max, JSON.stringify(result.summary), JSON.stringify(result.series)],
    );
    res.status(201).json(saved.rows[0]);
  } catch (error) {
    next(error);
  } finally {
    testRunning = false;
    await rm(directory, { recursive: true, force: true });
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`TraceLens API listening on :${port}`));
