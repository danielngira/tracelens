# TraceLens

TraceLens is a local workbench for exploring how API and PostgreSQL settings affect request performance. It runs a seeded API under k6 load, stores repeatable test results, and compares the latest run with the previous run.

## Start locally

Requirements: Docker Desktop with Docker Compose.

```sh
docker compose up --build
```

Open <http://localhost:5173>. The API health check is at <http://localhost:4000/health>. PostgreSQL seeds 20,000 products on its first start. To reset the database and seed again, run `docker compose down -v` and then start the stack again.

## Architecture

- **web**: React + Vite dashboard
- **api**: TypeScript + Express service, with request and database-pool measurements
- **db**: PostgreSQL 16 with generated sample products

The API exposes `GET /api/products/:code` as the sample database-backed endpoint. `GET /api/metrics` reports current in-flight API requests, pool usage, and recent query timing. The dashboard starts a k6 run against that endpoint and saves summary and per-second time-series measurements in PostgreSQL. The supported database setting is the connection-pool maximum (1–50); test runs accept 1–100 virtual users and durations of 5–120 seconds.

## Metrics

- **Latency percentiles**: p50 is the median; p95 and p99 show the slower tail of requests.
- **Requests per second (RPS)**: completed requests divided by the measurement interval.
- **Error rate**: failed requests divided by all requests.
- **Pool usage**: checked-out database connections and requests waiting for a connection.
- **Query timing**: time spent in the sample PostgreSQL query, separate from total HTTP time.

The dashboard shows the latest run and compares its p95 latency and throughput with the previous saved run. Each run records its virtual-user count, duration, and pool maximum so settings remain visible alongside the results.

Performance results vary with the host machine and concurrent activity. Treat them as observations and compare runs made under the same conditions.

## Development

```sh
npm install
npm run dev       # API (requires PostgreSQL; use docker compose up db)
npm run dev:web   # dashboard
npm test          # API unit tests
```
