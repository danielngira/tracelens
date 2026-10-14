# TraceLens implementation roadmap

## Working baseline

- Start the web app, API, and PostgreSQL with Docker Compose.
- Seed 20,000 product records automatically.
- Run the prepared Product lookup scenario with k6.
- Save run summaries and per-second data in PostgreSQL.
- Show p50, p95, p99, throughput, error rate, a simple pass/fail result, live API/pool/query measurements, and an `EXPLAIN ANALYZE` plan.
- Change the API's PostgreSQL pool maximum and compare the new run with the previous run.
- Review saved runs from the Test runs navigation item.

## Next implementation steps

### 1. Make the experiment easier to interpret

- Add a toggle that creates or drops an index for a deliberately unindexed sample search.
- Use a query and dataset that reliably produce different PostgreSQL plans with and without the index.
- Save the index state and pool size with each run; show both in the comparison.
- Explain that host load, warm caches, and short runs introduce noise.

### 2. Improve run comparison

- Let users choose any two saved runs instead of automatically comparing the newest pair.
- Show both runs' settings and metrics side by side.
- Overlay their latency and throughput time series on the same chart.
- Flag when test inputs differ so the comparison is not mistaken for a controlled experiment.

### 3. Improve test reliability and diagnostics

- Add an API integration test that starts PostgreSQL, checks seeding, executes a sample request, and saves a run.
- Exercise k6 execution in the Compose environment as part of a smoke-test command.
- Add warm-up requests and a short cool-down so the measured interval is better defined.

### 4. Polish the scenario experience

- Add a second prepared scenario, such as category listing with a variable result limit.
- Make scenario descriptions, endpoint, and expected database work visible before the run.
- Add input validation and a clear test-in-progress state with elapsed time.

## Out of scope for this portfolio version

- Arbitrary public URLs, cloud deployment, Kubernetes, distributed tracing, production monitoring, and AI diagnoses.
