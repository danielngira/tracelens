# TraceLens

TraceLens is a local workbench for exploring how API and PostgreSQL settings affect request performance. It runs a seeded API under k6 load, stores repeatable test results, and compares the latest run with the previous run.

## Start locally

Requirements: Docker Desktop with Docker Compose. The API image includes k6, so the runner does not need a separate host installation.

```sh
docker compose up --build
```

Open <http://localhost:5173>. The API health check is at <http://localhost:4000/health>. PostgreSQL seeds 20,000 products on its first start. To reset the database and seed again, run `docker compose down -v` and then start the stack again.

## Architecture

- **web**: React + Vite dashboard
- **api**: TypeScript + Express service, with request and database-pool measurements
- **db**: PostgreSQL 16 with generated sample products

The API exposes `GET /api/products/:code` as the sample database-backed endpoint. `GET /api/metrics` reports current in-flight API requests, pool usage, and recent query timing. The dashboard starts a k6 run against that endpoint and saves summary and per-second time-series measurements in PostgreSQL. The API streams k6's detailed output instead of loading the entire file into memory; k6 supplies the overall p50, p95, and p99 values, while chart percentiles use a bounded per-second sample. The supported database setting is the connection-pool maximum (1–50); test runs accept 1–100 virtual users and durations of 5–120 seconds.

## Metrics

- **Latency percentiles**: p50 is the median; p95 and p99 show the slower tail of requests.
- **Requests per second (RPS)**: completed requests divided by the measurement interval.
- **Error rate**: failed requests divided by all requests.
- **Pool usage**: checked-out database connections and requests waiting for a connection.
- **Query timing**: time spent in the sample PostgreSQL query, separate from total HTTP time.

The dashboard shows the latest run and compares its p95 latency and throughput with the previous saved run. Each run records its virtual-user count, duration, and pool maximum so settings remain visible alongside the results.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the next implementation steps and the current project boundary.

Performance results vary with the host machine and concurrent activity. Treat them as observations and compare runs made under the same conditions.

## Development

For the preferred local workflow, keep Node on your Mac and run PostgreSQL in Docker:

```sh
npm install
brew install k6      # macOS only; the native API uses the host k6 executable
npm run dev       # starts PostgreSQL in Docker, then the API on port 4000
npm run dev:web   # dashboard in a second terminal
npm test          # API unit tests
```

The full `docker compose up --build` command starts the API and dashboard in containers; do not run the host API on port 4000 at the same time as that stack. If you prefer to start the database separately, use `docker compose up -d db`.

If the API reports that port 4000 is already in use on macOS, identify the listener with `lsof -nP -iTCP:4000 -sTCP:LISTEN` and stop that specific process with `kill <PID>`. If you need to keep it running, start the API on port 4001 and point the dashboard at it:

```sh
PORT=4001 npm run dev
VITE_API_URL=http://localhost:4001 npm run dev:web
```

The load-test runner uses the API's configured `PORT` automatically.
