# WindSight: day-ahead wind forecast intelligence for GB power buyers

WindSight helps a UK utility's day-ahead trading desk answer two questions before the auction closes:

1. **What does the latest wind forecast say for tomorrow, at the moment I have to bid?**
2. **How much can I trust it?** (quantified, so the buy volume can carry a sensible margin)

It uses only Elexon BMRS data: national wind outturn (`FUELHH`, `fuelType=WIND`) and wind forecasts (`WINDFOR`), for purchase decisions made in **January 2026**.

| | |
|---|---|
| **Live app** | https://rzq4wk.vercel.app |
| **Video walkthrough** | _add the unlisted YouTube link here_ |
| **API docs** | https://rzq4wk.vercel.app/api/docs (OpenAPI / Swagger UI) |
| **Source** | https://github.com/DevrajParmarr/rzq4wk |

---

## What the product does

| View | Purpose |
|---|---|
| **Day-ahead view** | Pick a delivery day *D*. See the forecast that was available at the auction deadline on *D−1*, its 80% likely range, an experimental adjusted forecast, and (in hindsight) what actually happened. Export the hourly table to CSV. |
| **Forecast accuracy** | Month-level scorecard of decision-time forecasts: MAE, RMSE, bias, P90 error, over-forecast frequency, range coverage. Charts of daily energy, error vs lead time, error by hour of day, and the error distribution, plus a clickable per-day table. |
| **Explorer** | Any date range with a forecast-horizon slider (0–48 h): actual vs the latest forecast that was at least *h* hours old. |
| **Method & data** | Plain-English definitions, assumptions and limitations. |

The decision deadline is selectable in the header. Presets are the **EPEX SPOT GB hourly auction (09:20 UK)** and the **Nord Pool N2EX GB auction (09:50 UK)**, and any custom time can be entered. All views, including the URL, follow the selected deadline, so a view can be shared as a link.

### Key findings (January 2026, 09:20 deadline)

| Metric | Value |
|---|---|
| Mean absolute error (hourly) | 2,022 MW (17.9% of mean outturn) |
| Bias (forecast − actual) | +1,746 MW. The forecast was too high in 85% of hours |
| P90 absolute error | 4,154 MW |
| Lead time at the deadline | 16.5 h to 39.5 h |
| Error growth with lead time | MAE 1,680 MW at 0 h, rising to 2,301 MW at 48 h |
| 80% range coverage (out-of-sample by day) | 77.7% (target 80%) |
| Adjusted forecast MAE (trailing 7-day ratio, no look-ahead) | 1,409 MW, **30% lower** |

The dominant error is a **systematic over-forecast** rather than random noise. Metered outturn excludes curtailed wind, while the forecast does not, which is a plausible cause. Correcting for it with recent settled history is cheap and effective.

---

## Quick start

### Option A: Docker (one command)

```bash
docker compose up --build
# open http://localhost:8000          (app)
#      http://localhost:8000/api/docs (API docs)
```

### Option B: local development (hot reload)

Prerequisites: Python 3.12+ and Node 20.19+ or 22.12+.

```bash
# Terminal 1: API on :8000
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2: React dev server on :5173 (proxies /api to :8000)
cd frontend
npm ci
npm run dev
# open http://localhost:5173
```

### Tests and lint

```bash
cd backend && pytest -q && ruff check . && ruff format --check .
cd frontend && npm run typecheck && npm test
```

### Refreshing the data snapshot

The repo ships a snapshot of the two Elexon datasets in `backend/data/`, so the app starts instantly and does not depend on Elexon being available. To re-download it:

```bash
cd backend
python -m scripts.fetch_data
```

To analyse a different month, set `WINDSIGHT_DECISION_START` and `WINDSIGHT_DECISION_END` (ISO dates) before fetching and running.

---

## Deployment

The production artefact is one Docker image. It contains FastAPI serving the JSON API at `/api/v1` and the built React app at `/`.

**Vercel** (serverless, used for the live app). The config is in `vercel.json` and `api/index.py`. Vercel builds the React app as static files and runs FastAPI as a Python function for `/api/*`. Vercel CLI 47.2.2 or newer is required.

```bash
npm i -g vercel
vercel           # first run: link/create the project, accept the detected settings
vercel --prod
```

**Heroku** (container). The config is in `heroku.yml`.

```bash
heroku create <app-name>
heroku stack:set container -a <app-name>
git push heroku main
```

**Any container host.** Build the image with `docker build -t windsight .` and run it with `docker run -p 8000:8000 windsight`. The `PORT` environment variable is honoured.

---

## Repository layout

```
.
├── backend/                     Python 3 · FastAPI · pandas
│   ├── app/
│   │   ├── main.py              FastAPI app: routes, middleware (gzip, CORS, timing, caching), static hosting
│   │   ├── analysis.py          Core logic: as-of forecast selection, metrics, uncertainty band, adjusted forecast
│   │   ├── data.py              Loads and cleans the Elexon snapshot (dedup, UTC timestamps)
│   │   ├── elexon.py            Async Elexon BMRS client (chunked, retried)
│   │   ├── schemas.py           Pydantic response models = public API contract
│   │   ├── serialize.py         pandas/numpy → JSON-safe values
│   │   └── config.py            Settings (env vars WINDSIGHT_*)
│   ├── scripts/fetch_data.py    Downloads the snapshot from Elexon
│   ├── data/                    Snapshot: wind_actuals.csv (FUELHH), wind_forecasts.csv (WINDFOR)
│   ├── tests/                   pytest: unit (synthetic data), API contract, real-snapshot invariants
│   ├── requirements.txt         Runtime dependencies (pinned)
│   ├── requirements-dev.txt     + pytest, ruff
│   └── pyproject.toml           ruff and pytest configuration
├── frontend/                    React 19 · TypeScript · Vite · TanStack Query · Recharts
│   ├── src/
│   │   ├── App.tsx              Shell: header, tabs, deadline picker, URL state
│   │   ├── views/               DayAheadView, AccuracyView, ExplorerView, MethodView
│   │   ├── components/ui.tsx    Panel, KPI card, toggle, legend, loading/error states
│   │   ├── api/                 Typed API client, response types, React Query hooks
│   │   ├── lib/                 Formatting (UK time zone), chart data shaping, theme, URL state
│   │   └── styles.css           Design tokens, light/dark themes, responsive layout
│   └── package.json
├── api/index.py                 Vercel serverless entry point (imports backend/app)
├── Dockerfile                   Multi-stage build: Node builds the UI, Python serves UI and API
├── docker-compose.yml           Local one-command run
├── heroku.yml                   Heroku container deploy
├── vercel.json                  Vercel build and routing
├── requirements.txt             Python dependencies for the Vercel function
├── .github/workflows/ci.yml     CI: lint, tests, typecheck, build, Docker smoke test
└── docs/
    ├── ARCHITECTURE.md          Design, decisions and trade-offs, testing, next steps
    └── VIDEO_SCRIPT.md          Script for the two-part demo video
```

---

## API

| Endpoint | Description |
|---|---|
| `GET /api/v1/health` | Liveness check |
| `GET /api/v1/meta` | Scope, delivery dates, deadline presets, data coverage |
| `GET /api/v1/day-ahead?delivery_date=2026-01-15&gate=09:20` | Decision-time forecast, 80% range, adjusted forecast, outturn and day metrics |
| `GET /api/v1/accuracy?gate=09:20` | Month scorecard, daily, by-hour, by-horizon, error histogram and quantiles |
| `GET /api/v1/series?start=…&end=…&horizon_h=4` | Actual vs the latest forecast at least *h* hours old, over any range up to 35 days |

`gate` is optional and defaults to 09:20. Invalid input returns `422` with a readable `detail`.

---

## Method in brief

- **Forecast selection without look-ahead.** For each target hour *t* in delivery day *D*, the tool uses the latest WINDFOR forecast for *t* with `publishTime ≤ deadline on D−1`, in UK local time. This is a `pandas.merge_asof` keyed by target time.
- **Accuracy** is computed on the hourly timestamps present in both datasets. Forecasts are hourly and actuals half-hourly, so no interpolation is assumed. The error is defined as forecast minus actual, so a positive error means a wind shortfall.
- **80% likely range** = forecast minus the empirical P90 and P10 of decision-time errors on the *other* delivery days. Coverage is reported out of sample, one day at a time.
- **Adjusted forecast (beta)** = forecast × (Σ actual / Σ forecast) over delivery days D−8 to D−2. These are the days fully settled before the deadline.
- **Delivery day** = 00:00–24:00 UK local time. Clock-change days of 23 h and 25 h are handled.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions, trade-offs and next steps.

---

## Use of AI tools

This project was built with the help of an AI coding assistant (**Claude Code, by Anthropic**). It was used for domain research, scaffolding, implementation, tests, documentation and the video script. The output is verified by the automated test suites, a Docker smoke test, and invariant checks run against the real Elexon snapshot (for example, no forecast published after the deadline is ever used).
