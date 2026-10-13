# AquaTrace — AI Water-Wastage Intelligence

AquaTrace is a **simulator-driven** water intelligence dashboard for hotels. It
generates realistic building demand, predicts what each meter *should* be
reading, detects persistent excess flow, localises the deepest affected node,
diagnoses the likely cause, and quantifies the water and cost lost — all in
real time.

> **All telemetry is simulated.** AquaTrace ships with a built-in hydraulic/demand
> simulator. There are no real sensors, building systems or personal data
> anywhere in the project. Model confidence values are heuristic evidence
> scores, not calibrated probabilities, and benchmark numbers describe the
> detector on the simulator — not field-validated performance.

---

## Why it is honest

The simulator is the single source of truth.

- Faults are injected **into the simulator** (leaks, running cisterns, open taps,
  laundry inefficiency, sensor drift, missing sensors, legitimate demand surges).
- The detector has **no knowledge** of what was injected. It only sees readings.
- The expected-use model is trained on **healthy** history and uses **exogenous
  features only** (occupancy, meals, laundry load, hour, day-of-week, node
  identity). Recent-actual lags are deliberately excluded so a leak cannot be
  absorbed into its own expectation — the residual stays visible until the fault
  is removed.
- Incidents are raised only at the **deepest abnormal node**, so one leak maps to
  one incident even though upstream meters also shift.
- Benchmarks are computed from freshly generated streams with fixed and
  historical baselines, and are labelled everywhere as simulation results.

---

## Architecture

```
backend/                FastAPI + SQLAlchemy + SQLite + LightGBM
  app/
    config.py           Runtime settings (thresholds, tank, tariff)
    network.py          Distribution topology (main inlet, wings, floors, kitchen, laundry, tank)
    demand.py           Exogenous demand generation (occupancy, meals, laundry)
    faults.py           8 scenarios + custom fault injection
    simulator.py        The engine: clock, telemetry, detection, incidents
    ml/
      features.py       Feature set (exogenous only)
      expected_use.py   LightGBM quantile model (P10/P50/P90) + historical fallback
      detector.py       Band + persistence + CUSUM + burst + night-flow state machine
      diagnosis.py      Rules-based cause classification
      localisation.py   Deepest-abnormal-node localisation
      training.py       Healthy-history generation
    services/           Incidents, recommendations, tank, benchmark, export
    routers/            REST API (core, simulation, telemetry, ai, incidents, benchmarks, export)
  tests/                pytest suite (simulator, network, API, benchmark)
  scripts/smoke.py      End-to-end smoke run

frontend/               React + TypeScript + Vite + Tailwind + Recharts + Framer Motion
  src/
    api/                Typed API client and types
    store/              Simulation polling context + notification context
    components/         Layout, UI primitives, charts, network graph
    pages/              9 dashboard routes
```

### Units

Flow is reported in **litres per 15-minute interval** (`L/interval`). One
interval equals **4 L/h**. The UI always labels conversions, so a number is never
shown with two different meanings. Tank volume is in litres; cost uses the
configured tariff (default ₹150 per kL).

---

## Running the app

### Prerequisites
- Python 3.11+ (3.12/3.13 tested)
- Node.js 20+
- No internet access required after dependencies are installed

### One command

Windows (PowerShell 7+):
```powershell
pwsh ./start.ps1
```

macOS / Linux:
```bash
./start.sh
```

This creates the backend virtual environment, installs both dependency sets,
launches the API on `http://localhost:8000` and the dashboard on
`http://localhost:5173`.

### Manual

Backend:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>. API docs are at <http://localhost:8000/docs>.

### Docker (optional)
```bash
docker compose up --build
```

---

## Using the dashboard

| Page | What it shows |
| --- | --- |
| **Overview** | KPIs, main-inlet actual vs expected band, network snapshot, active incidents, AI status |
| **Live Monitor** | Per-node readings, detector reasoning, evidence, exogenous context |
| **Water Network** | Live SVG topology with state propagation and a node register |
| **AI Intelligence** | Model metadata, detection pipeline, residuals, live localisation |
| **Incidents** | Filters, diagnosis, localisation, supporting readings chart, timeline, lifecycle actions |
| **Simulation Lab** | Scenario picker, custom fault injection, playback/seed control, event log |
| **Benchmarks** | Honest detection metrics vs baselines, per-seed results, fault composition |
| **Tank Planning** | Reserve coverage and a clearly-labelled level projection |
| **Settings** | Runtime config, detector parameters, notifications, exports |

**Guided demo:** open **Simulation Lab → Run guided demo** (or the Overview
banner) to inject a pipe leak and watch the anomaly propagate from raw reading →
detector state → localised incident → recommendation.

---

## REST API (selected)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Status, data mode, model, version |
| GET | `/api/network` | Topology with live readings |
| GET | `/api/simulation/state` | Clock, speed, scenario, active faults |
| POST | `/api/simulation/{start,pause,stop,step,reset,speed,scenario}` | Playback control |
| POST | `/api/simulation/inject-fault`, `/remove-fault` | Fault control |
| POST | `/api/simulation/run-leak-demo` | Guided demo |
| GET | `/api/telemetry/latest`, `/history` | Readings |
| GET | `/api/ai/status`, POST `/api/ai/retrain` | Model status / retrain |
| GET | `/api/incidents`, `/api/incidents/{id}` | Incidents and detail |
| POST | `/api/incidents/{id}/{acknowledge,in-progress,resolve,false-positive}` | Lifecycle |
| GET | `/api/recommendations` | Prioritised actions |
| GET | `/api/tank/status` | Tank/reserve planning |
| POST/GET | `/api/benchmarks/run`, `/latest` | Benchmark run and results |
| GET | `/api/export/telemetry`, `/incidents` | CSV / JSON export |

---

## Configuration

Copy `.env.example` to `.env` (backend reads environment variables):

| Variable | Default | Meaning |
| --- | --- | --- |
| `AQUATRACE_DB` | `backend/aquatrace.db` | SQLite file |
| `AQUATRACE_COST_PER_KL` | `150` | Tariff for cost estimates |
| `AQUATRACE_CURRENCY` | `₹` | Currency symbol |
| `AQUATRACE_TANK_CAPACITY` | `50000` | Tank capacity (litres) |
| `AQUATRACE_MIN_EXCESS_LPH` | `8` | Minimum excess to flag |

Frontend reads `VITE_API_URL` (see `frontend/.env.example`), default
`http://localhost:8000`.

---

## Tests

Backend:
```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend:
```bash
cd frontend
npm test          # vitest (unit + component)
npm run build     # typecheck + production build
```

End-to-end smoke:
```powershell
cd backend
$env:PYTHONPATH="P:\ai-tourism-hackathon\backend"
.\.venv\Scripts\python.exe scripts\smoke.py
```

---

## Tech stack

- **Backend:** FastAPI, Uvicorn, SQLAlchemy 2, SQLite (WAL), Pydantic v2,
  pandas, NumPy, LightGBM, scikit-learn
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts,
  Framer Motion, lucide-react, React Router
- **Testing:** pytest, Vitest, Testing Library

---

## License / attribution

Built as a hackathon project. AquaTrace is a simulator and decision-support
demonstrator — not a certified leak-detection system.
