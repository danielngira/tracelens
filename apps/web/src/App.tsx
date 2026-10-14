import { useEffect, useState } from 'react';
import { Activity, ChevronDown, CircleHelp, Clock3, Database, Gauge, Play, Server, Waves } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
type Metrics = { activeRequests: number; pool: { total: number; idle: number; waiting: number }; query: { count: number; averageMs: number; lastMs: number } };
type Run = { id: number; created_at: string; scenario: string; virtual_users: number; duration_seconds: number; pool_size: number; summary: { requests: number; requestsPerSecond: number; errorRate: number; p50: number; p95: number; p99: number }; series: { second: number; requestsPerSecond: number; p50: number; p95: number; p99: number }[] };
type QueryPlan = { nodeType: string; indexName: string | null; relation: string | null; planningMs: number; executionMs: number; sharedHitBlocks: number; sharedReadBlocks: number };
type Scenario = { id: string; name: string; description: string; endpoint: string };

const initialMetrics: Metrics = { activeRequests: 0, pool: { total: 0, idle: 0, waiting: 0 }, query: { count: 0, averageMs: 0, lastMs: 0 } };
const availableScenarios: Scenario[] = [{ id: 'product-lookup', name: 'Product lookup', description: 'Read a seeded product record by its code.', endpoint: 'GET /api/products/:code' }];

function App() {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [duration, setDuration] = useState(30);
  const [vus, setVus] = useState(50);
  const [poolSize, setPoolSize] = useState(10);
  const [settingsSaved, setSettingsSaved] = useState(true);
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<Run | null>(null);
  const [previousRun, setPreviousRun] = useState<Run | null>(null);
  const [queryPlan, setQueryPlan] = useState<QueryPlan | null>(null);
  const [runError, setRunError] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'runs' | 'docs'>('overview');
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [runHistory, setRunHistory] = useState<Run[]>([]);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const [healthResponse, metricsResponse] = await Promise.all([fetch(`${API}/health`), fetch(`${API}/api/metrics`)]);
        if (!healthResponse.ok || !metricsResponse.ok) throw new Error('API unavailable');
        const next = await metricsResponse.json() as Metrics;
        if (mounted) { setMetrics(next); setStatus('online'); }
      } catch { if (mounted) setStatus('offline'); }
    };
    void poll();
    const timer = window.setInterval(poll, 1500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => { fetch(`${API}/api/settings`).then(response => response.json()).then(data => setPoolSize(data.poolSize)).catch(() => undefined); }, []);
  useEffect(() => { fetch(`${API}/api/query-plan`).then(response => response.ok ? response.json() as Promise<QueryPlan> : null).then(setQueryPlan).catch(() => undefined); }, []);

  useEffect(() => {
    fetch(`${API}/api/runs`).then(response => response.ok ? response.json() as Promise<Run[]> : []).then(runs => {
      setRunHistory(runs);
      setLatestRun(runs[0] ?? null);
      setPreviousRun(runs[1] ?? null);
    }).catch(() => undefined);
  }, []);

  const startRun = async () => {
    setRunning(true);
    setRunError('');
    try {
      const response = await fetch(`${API}/api/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ virtualUsers: vus, durationSeconds: duration }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details ? `${payload.error}: ${payload.details}` : payload.error ?? 'The test could not be started.');
      setPreviousRun(latestRun);
      setLatestRun(payload as Run);
      setRunHistory(current => [payload as Run, ...current.filter(run => run.id !== (payload as Run).id)].slice(0, 20));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The test failed. Check the API logs.');
    } finally { setRunning(false); }
  };

  const saveSettings = async () => {
    setRunError('');
    try {
      const response = await fetch(`${API}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poolSize }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details ? `${payload.error}: ${payload.details}` : payload.error ?? 'Settings could not be applied.');
      setPoolSize(payload.poolSize);
      setSettingsSaved(true);
    } catch (error) { setRunError(error instanceof Error ? error.message : 'Settings could not be applied.'); }
  };

  const change = (before: number, after: number) => before === 0 ? '—' : `${after > before ? '+' : ''}${(((after - before) / before) * 100).toFixed(1)}%`;
  const selectedScenario = availableScenarios[0];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={19} strokeWidth={2.2} /></div><span>tracelens</span><span className="version">LOCAL</span></div>
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${activeView === 'overview' ? 'selected' : ''}`} onClick={() => setActiveView('overview')}><Gauge size={17} /> Overview</button>
      <button className={`nav-item ${activeView === 'runs' ? 'selected' : ''}`} onClick={() => setActiveView('runs')}><Waves size={17} /> Test runs <span className="nav-count">{runHistory.length}</span></button>
      <div className="side-label scenarios-label">SCENARIOS</div>
      {availableScenarios.map(scenario => <button key={scenario.id} className={`scenario-link ${selectedScenario.id === scenario.id ? 'active' : ''}`} onClick={() => { setActiveView('overview'); setScenarioMenuOpen(false); }}><span className="scenario-dot" /> {scenario.name}</button>)}
      <div className="sidebar-bottom"><button className={`help-row ${activeView === 'docs' ? 'help-active' : ''}`} onClick={() => setActiveView('docs')}><CircleHelp size={16} /> Documentation</button><div className="user-chip"><div className="avatar">TL</div><div><strong>Local workspace</strong><small>Personal environment</small></div><ChevronDown size={15} /></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>{activeView === 'overview' ? 'Overview' : activeView === 'runs' ? 'Test runs' : 'Documentation'}</strong></div><div className={`connection ${status}`}><span />{status === 'online' ? 'API connected' : status === 'offline' ? 'API unavailable' : 'Connecting'}</div></header>
      <div className="content">
        <section className="page-heading"><div><div className="eyebrow">PERFORMANCE WORKBENCH</div><h1>{activeView === 'overview' ? 'Overview' : activeView === 'runs' ? 'Test runs' : 'Documentation'}</h1><p>{activeView === 'overview' ? 'Run a controlled test. See what changes under load.' : activeView === 'runs' ? 'Review saved runs and the settings used for each test.' : 'How to run and interpret local performance tests.'}</p></div></section>

        {activeView === 'overview' ? <>

        <section className="test-panel">
          <div className="panel-heading"><div><div className="panel-icon"><Play size={16} fill="currentColor" /></div><div><h2>Configure test</h2><p>Choose a scenario and set the target load.</p></div></div><span className="draft-tag">READY TO RUN</span></div>
          <div className="test-controls">
            <div className="field scenario-field scenario-picker"><span>SCENARIO</span><button type="button" className="select-control" aria-expanded={scenarioMenuOpen} onClick={() => setScenarioMenuOpen(open => !open)}><span><i className="tiny-dot" /> {selectedScenario.name}</span><ChevronDown size={15} /></button>{scenarioMenuOpen && <div className="scenario-menu"><button type="button" className="scenario-option" onClick={() => setScenarioMenuOpen(false)}><span className="scenario-option-title"><i className="tiny-dot" />{selectedScenario.name}<span className="scenario-check">Selected</span></span><small>{selectedScenario.description}</small><code>{selectedScenario.endpoint}</code></button></div>}</div>
            <label className="field"><span>VIRTUAL USERS <b title="Concurrent simulated users">ⓘ</b></span><div className="input-wrap"><input type="number" min="1" max="100" value={vus} onChange={e => setVus(Number(e.target.value))} /><small>users</small></div></label>
            <label className="field"><span>DURATION <b title="Test length">ⓘ</b></span><div className="input-wrap"><input type="number" min="5" max="120" value={duration} onChange={e => setDuration(Number(e.target.value))} /><small>seconds</small></div></label>
            <label className="field"><span>DB POOL MAX <b title="Maximum pooled connections">ⓘ</b></span><div className="input-wrap"><input type="number" min="1" max="50" value={poolSize} onChange={e => { setPoolSize(Number(e.target.value)); setSettingsSaved(false); }} /><small>connections</small></div></label>
            {!settingsSaved && <button className="apply-button" onClick={saveSettings}>Apply</button>}
            <button className="run-button" disabled={running || status !== 'online' || !settingsSaved} onClick={startRun}><Play size={15} fill="currentColor" />{running ? 'Running…' : 'Run test'}</button>
          </div>
          <div className="panel-footnote"><span className="info-dot">i</span> Pool size changes apply to the next run. Keep scenario and load settings the same when comparing results.</div>
          {runError && <div className="run-error">{runError}</div>}
        </section>

        <div className="section-title"><div><h2>Latest run {latestRun && <span className="run-id">#{latestRun.id}</span>}</h2><p>{latestRun ? `${latestRun.virtual_users} users · ${latestRun.duration_seconds}s · DB pool ${latestRun.pool_size} · ${new Date(latestRun.created_at).toLocaleString()}` : 'No test runs yet. Start a run to see performance results here.'}</p></div>{latestRun && previousRun && <span className="compare-note">vs run #{previousRun.id}: p95 {change(previousRun.summary.p95, latestRun.summary.p95)} · throughput {change(previousRun.summary.requestsPerSecond, latestRun.summary.requestsPerSecond)}</span>}</div>
        <section className="metric-grid">
          <MetricCard label="P95 LATENCY" value={latestRun?.summary.p95.toFixed(1) ?? '—'} suffix="ms" hint={latestRun ? `p50 ${latestRun.summary.p50.toFixed(1)} ms · p99 ${latestRun.summary.p99.toFixed(1)} ms` : '95% of requests finish within this time'} icon={<Clock3 size={16} />} />
          <MetricCard label="THROUGHPUT" value={latestRun?.summary.requestsPerSecond.toFixed(1) ?? '—'} suffix="req/s" hint={`${latestRun?.summary.requests.toLocaleString() ?? '0'} completed requests`} icon={<Activity size={16} />} />
          <MetricCard label="ERROR RATE" value={latestRun ? (latestRun.summary.errorRate * 100).toFixed(2) : '—'} suffix="%" hint="Failed requests as a share of total" icon={<div className="error-icon">!</div>} />
          <MetricCard label="PASS / FAIL" value={latestRun ? (latestRun.summary.requests > 0 && latestRun.summary.errorRate < 0.01 && latestRun.summary.p95 < 500 ? 'PASS' : 'FAIL') : '—'} suffix="" hint="Threshold: p95 &lt; 500 ms · errors &lt; 1%" icon={<span className="pass-icon">✓</span>} />
        </section>

        <section className="chart-grid">
          <div className="chart-card"><div className="chart-header"><div><h3>Request latency</h3><p>p95 response time across the test</p></div><button className="period-button">{latestRun ? `${latestRun.duration_seconds}s run` : 'No run data'} <ChevronDown size={14} /></button></div><div className="empty-chart"><div className="chart-gridlines"><i /><i /><i /><i /></div>{latestRun ? <TrendChart points={latestRun.series.map(point => point.p95)} color="#83dcae" /> : <div className="chart-empty-content"><div className="empty-icon"><Clock3 size={19} /></div><strong>Latency data appears here</strong><span>Run a test to see p95 response time by second.</span></div>}<div className="axis-labels"><span>0s</span><span>{latestRun ? `${Math.round(latestRun.duration_seconds / 2)}s` : '15s'}</span><span>{latestRun ? `${latestRun.duration_seconds}s` : '30s'}</span></div></div><div className="legend"><span><i className="legend-p95" />p95 latency</span></div></div>
          <div className="chart-card"><div className="chart-header"><div><h3>Throughput</h3><p>Requests completed each second</p></div><button className="period-button">{latestRun ? `${latestRun.duration_seconds}s run` : 'No run data'} <ChevronDown size={14} /></button></div><div className="empty-chart"><div className="chart-gridlines"><i /><i /><i /><i /></div>{latestRun ? <TrendChart points={latestRun.series.map(point => point.requestsPerSecond)} color="#75aeea" /> : <div className="chart-empty-content"><div className="empty-icon"><Waves size={19} /></div><strong>Throughput data appears here</strong><span>Run a test to see how traffic holds over time.</span></div>}<div className="axis-labels"><span>0s</span><span>{latestRun ? `${Math.round(latestRun.duration_seconds / 2)}s` : '15s'}</span><span>{latestRun ? `${latestRun.duration_seconds}s` : '30s'}</span></div></div><div className="legend"><span><i className="legend-throughput" />requests / second</span></div></div>
        </section>

        <section className="detail-section"><div className="section-title detail-title"><div><h2>System signals</h2><p>Live measurements from the API and PostgreSQL.</p></div><span className="live-label"><i /> LIVE</span></div><div className="signal-grid">
          <div className="signal-card"><div className="signal-top"><span>APPLICATION</span><Server size={16} /></div><div className="signal-main"><strong>{metrics.activeRequests}</strong><span>active requests</span></div><div className="signal-meter"><i style={{ width: `${Math.min(metrics.activeRequests * 8, 100)}%` }} /></div><div className="signal-caption">Requests currently being handled</div></div>
          <div className="signal-card"><div className="signal-top"><span>DATABASE POOL</span><Database size={16} /></div><div className="signal-main"><strong>{metrics.pool.total ? `${metrics.pool.total - metrics.pool.idle}/${metrics.pool.total}` : '—'}</strong><span>connections in use</span></div><div className="signal-meter blue"><i style={{ width: `${metrics.pool.total ? ((metrics.pool.total - metrics.pool.idle) / metrics.pool.total) * 100 : 0}%` }} /></div><div className="signal-caption">{metrics.pool.waiting} requests waiting for a connection</div></div>
          <div className="signal-card"><div className="signal-top"><span>QUERY TIMING</span><Clock3 size={16} /></div><div className="signal-main"><strong>{metrics.query.count ? metrics.query.averageMs.toFixed(1) : '—'}</strong><span>average ms</span></div><div className="query-sub">Last query <b>{metrics.query.count ? `${metrics.query.lastMs.toFixed(1)} ms` : '—'}</b></div><div className="signal-caption">Across {metrics.query.count.toLocaleString()} sample endpoint queries</div></div>
          <div className="signal-card"><div className="signal-top"><span>QUERY PLAN</span><Database size={16} /></div><div className="signal-main"><strong className="plan-type">{queryPlan?.nodeType ?? '—'}</strong></div><div className="query-sub">{queryPlan?.indexName ? `Index: ${queryPlan.indexName}` : `Relation: ${queryPlan?.relation ?? 'loading'}`}</div><div className="signal-caption">EXPLAIN ANALYZE · {queryPlan ? `${queryPlan.executionMs.toFixed(2)} ms · ${queryPlan.sharedHitBlocks} buffer hits` : 'PostgreSQL plan details'}</div></div>
        </div></section>
        </> : activeView === 'runs' ? <RunHistory runs={runHistory} onSelectRun={run => { setLatestRun(run); setActiveView('overview'); }} /> : <Documentation />}
        <footer>TraceLens <span>·</span> Local performance experiments <span className="footer-right">Measurements are observations, not diagnoses.</span></footer>
      </div>
    </main>
  </div>;
}

function MetricCard({ label, value, suffix, hint, icon }: { label: string; value: string; suffix: string; hint: string; icon: React.ReactNode }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className="metric-icon">{icon}</div></div><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-hint">{hint}</div></div>;
}

function TrendChart({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points, 1);
  const polyline = points.map((value, index) => `${points.length < 2 ? 200 : (index / (points.length - 1)) * 400},${112 - (value / max) * 100}`).join(' ');
  return <svg className="trend-chart" viewBox="0 0 400 120" preserveAspectRatio="none" role="img" aria-label="Metric trend over the duration of the test"><polyline points={polyline} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function RunHistory({ runs, onSelectRun }: { runs: Run[]; onSelectRun: (run: Run) => void }) {
  if (!runs.length) return <section className="history-empty"><Waves size={22} /><h2>No saved runs yet</h2><p>Run the Product lookup scenario and its results will appear here.</p></section>;
  return <section className="history-panel"><div className="history-header"><h2>Saved test runs</h2><span>{runs.length} most recent</span></div><div className="history-table-wrap"><table className="history-table"><thead><tr><th>RUN</th><th>DATE</th><th>LOAD</th><th>DB POOL</th><th>P95</th><th>THROUGHPUT</th><th>ERRORS</th><th /></tr></thead><tbody>{runs.map(run => <tr key={run.id}><td className="history-id">#{run.id}</td><td>{new Date(run.created_at).toLocaleString()}</td><td>{run.virtual_users} users · {run.duration_seconds}s</td><td>{run.pool_size}</td><td>{run.summary.p95.toFixed(1)} ms</td><td>{run.summary.requestsPerSecond.toFixed(1)} req/s</td><td>{(run.summary.errorRate * 100).toFixed(2)}%</td><td><button className="history-view" onClick={() => onSelectRun(run)}>View</button></td></tr>)}</tbody></table></div></section>;
}

function Documentation() {
  return <section className="docs-grid">
    <article className="docs-card"><div className="docs-kicker">QUICK START</div><h2>Run your first test</h2><ol><li>Start the stack with <code>docker compose up --build</code>.</li><li>Choose Product lookup and set virtual users and duration.</li><li>Press Run test. The API runs k6 against the seeded local service.</li><li>Change DB pool max, apply the setting, then rerun with the same load.</li><li>Open Test runs to review saved results.</li></ol></article>
    <article className="docs-card"><div className="docs-kicker">METRICS</div><h2>Read the results</h2><dl><dt>p50 / p95 / p99</dt><dd>Request latency percentiles. p95 is the time 95% of requests completed within.</dd><dt>Throughput</dt><dd>Completed requests per second during the run.</dd><dt>Error rate</dt><dd>Failed requests divided by all measured requests.</dd><dt>Pool waiting</dt><dd>Requests queued because all available PostgreSQL connections are in use.</dd><dt>Query plan</dt><dd>PostgreSQL’s plan for the sample lookup, with measured execution time and buffer hits.</dd></dl></article>
    <article className="docs-card docs-wide"><div className="docs-kicker">INTERPRETATION</div><h2>Keep comparisons controlled</h2><p>Use the same scenario, user count, and duration when testing a setting change. Local results vary with host load and cache state, so compare them as evidence rather than a guaranteed diagnosis.</p></article>
  </section>;
}

export default App;
