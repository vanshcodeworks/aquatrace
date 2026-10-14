# AquaTrace

**AI water-leak detection simulator and operations dashboard for hotels.**

AquaTrace shows how an AI system can catch hidden water leaks in a hotel. It
builds a realistic digital building, simulates the water flowing through it,
learns what normal use looks like, then flags abnormal usage, points to the
exact location, explains the likely cause, and estimates the water and money
lost.

> Everything in AquaTrace is **simulated**. There are no real sensors, no
> personal data, and no live connection to any hotel. Benchmark numbers are
> simulation results and are labelled as such everywhere in the app.

---

## The problem it solves

Hotels lose a lot of water through slow, hidden faults: a leaking pipe, a cistern
that keeps running, a tap left open, an inefficient laundry line. These faults are
small compared to normal daily use, so they never trip a simple alarm. Managers
usually only find out on the water bill.

## What AquaTrace does

- Reproduces the hotel as a water network: inlet, wings, floors, kitchen,
  laundry and rooftop tanks.
- Simulates a flow reading for every meter every 15 minutes, driven by occupancy,
  meals, laundry load, time of day and weekday.
- Learns the expected level of use from healthy history.
- Compares actual vs expected and raises a single incident at the deepest
  abnormal point.
- Explains the likely cause, suggests an action, and estimates the water and
  cost lost.

## How detection works, in five plain steps

1. **Simulate.** The simulator injects faults and produces flow readings. The
   detector never sees what was injected.
2. **Predict.** A model estimates the expected flow and a normal band using
   outside factors only (occupancy, meals, laundry, hour, weekday, meter
   identity). Recent actuals are deliberately excluded.
3. **Watch the gap.** Actual minus expected is the residual. Small, persistent
   residuals are suspicious, so a leak cannot hide inside normal variation.
4. **Localise.** The incident is placed at the deepest meter that is abnormal,
   so one leak becomes one ticket instead of many.
5. **Diagnose and recommend.** Rule-based reasoning names the likely fault type
   and the suggested action.

## Why the results are trustworthy

- The simulator is the single source of truth. Every number comes from it.
- The model is trained on healthy data and never uses recent actuals, so a leak
  stays visible until it is fixed.
- Incidents are raised only at the deepest abnormal node.
- Detection metrics are always shown next to simple baselines and are clearly
  labelled as simulation results.

---

## Dashboard tour

| Tab | What it shows |
| --- | --- |
| **Executive Cockpit** | Water balance, tanker autonomy, savings, active incidents, network snapshot |
| **Spatial Twin** | 3D building model and the live hydraulic pipe topology |
| **Incidents & Dispatch** | Room localisation, valve isolation and work orders with a full timeline |
| **Department Savings** | Recommendations grouped by Rooms, Laundry and Kitchen |
| **Simulation Lab** | Scenario picker, custom fault injection, playback and seed control, event log |
| **Settings** | Runtime config, detector parameters, notifications, exports and advanced tools |

Advanced screens live inside **Settings** so daily operators are not exposed to
data-science tooling: **Live Monitor**, **Pipe Topology**, **AI Engine**,
**Benchmarks** and **Tank Planning**.

### Guided demo

Open **Simulation Lab → Run guided demo** (or the banner on the Executive
Cockpit). A pipe leak is injected and you can watch the anomaly move from raw
reading to detector state, to a localised incident, to a recommendation.

### Interactive 3D twin

The Spatial Twin is a 3D model of the hillside hotel with the water network drawn
over it as a flowing, colour-coded pipe system. You can rotate, zoom, select
sensors, and switch between the 3D view and the pipe topology. Day and night
modes change the lighting.

---

## Demo script (5 minutes, for judges)

A ready-to-present walkthrough. The goal is to follow one hidden **pipe leak in
Wing A** from a raw meter reading to a dispatched incident, and to see it on the
3D twin.

> Before you start: launch the app, open the dashboard, and check the header
> shows it is connected.

1. **Executive Cockpit.** The whole property on one screen: water balance, tank
   reserve, tanker autonomy, savings and active incidents (all calm right now).
2. **Spatial Twin → 3D building.** Click a sensor pin to show Actual vs Expected.
   Point out the mapping: **S1** Municipal Intake, **S3** Wing A, **S4** Wing B,
> S7 Floor 2 Suite 206. Try the day/night toggle.
2. **Simulation Lab**. Set **Fault type = Pipe leak**, **Node = Wing A**,
   **Intensity = 60 L/h**, **Onset = Sudden**, **Duration = 300 min**, then click
   **Inject fault**.
3. Set **Speed to 60x** and press **Run**. The engine adds 60 L/h of extra flow
   into Wing A, exactly like a real leaking pipe. The detector does not see the
   injection; it only sees the meter readings.
4. Back to **Spatial Twin** (3D). Within a few simulated intervals the Wing A pin
   (S3) turns red, an alert badge appears, and the upstream intake (S1) lifts.
   The abnormal-node count and excess L/h rise.
5. Click the **Wing A** pin. Actual is now above Expected, and the inspector
   shows the excess flow and the evidence note.
6. Open **Incidents & Dispatch**. One incident was raised at Wing A with a
   diagnosis, confidence, excess litres and cost, and a timeline. Walk through
   the lifecycle actions (Acknowledge -> In progress -> Resolve) and isolate the
   branch.
7. Prove it is honest: go to **Simulation Lab -> Simulate remediation** (or
   remove the fault) and watch the nodes return to healthy. Optional: open
   **Settings -> Benchmarks** to see measured detection metrics against simple
   baselines.

Heads-up: the quick **Test Room 206 Leak** button in the 3D twin injects a preset
leak in Wing B (Room 206). For the Wing A story, inject from the Simulation Lab
as above. Detection needs about three abnormal readings in a row (persistence),
and 60 L/h sits well above the 8 L/h noise floor, so give it a few intervals.

---

## Tech stack

- **Backend:** FastAPI, Uvicorn, SQLAlchemy 2, SQLite (WAL), Pydantic v2, pandas,
  NumPy, LightGBM, scikit-learn
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Framer
  Motion, lucide-react, React Router, Three.js
- **Testing:** pytest, Vitest, Testing Library

## Project layout

```
backend/                FastAPI API and simulation engine
  app/
    config.py           Settings (tolerances, tariff, tank, CORS, autostart)
    network.py          Hotel water topology
    demand.py           Occupancy-driven usage model
    faults.py           Injected fault types
    simulator.py        Tick loop, readings, incidents
    ml/                 Expected-use model, detector, diagnosis, localisation
    services/           Incidents, recommendations, tank, benchmarks, export
    routers/            REST endpoints
  tests/                pytest suite
frontend/               React dashboard
  src/
    api/                Typed API client
    store/              Simulation polling context
    components/         Layout, charts, 3D twin, network graph
    pages/              Dashboard screens
```

---

## Run it locally

Requirements: Python 3.11+ and Node.js 20+. No internet is needed after
dependencies are installed.

**One command**

Windows (PowerShell 7+):
```powershell
pwsh ./start.ps1
```

macOS / Linux:
```bash
./start.sh
```

This creates the backend virtual environment, installs both dependency sets, and
launches the API on `http://localhost:8000` and the dashboard on
`http://localhost:5173`.

**Manual**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`. API docs are at `http://localhost:8000/docs`.

**Docker (optional)**
```bash
docker compose up --build
```

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```
```bash
cd frontend
npm test          # vitest unit and component tests
npm run build     # typecheck and production build
```

---

## Units and assumptions

Flow is reported in **litres per 15-minute interval** (`L/interval`). One interval
equals **4 L/h**. The UI labels conversions so a number never means two things.
Tank volume is in litres and cost uses the configured tariff (default ₹150 per
kL). Defaults come from `backend/app/config.py` and can be overridden with
environment variables.

| Variable | Default | Meaning |
| --- | --- | --- |
| `AQUATRACE_DB` | `backend/aquatrace.db` | SQLite file |
| `AQUATRACE_COST_PER_KL` | `150` | Tariff for cost estimates |
| `AQUATRACE_CURRENCY` | `₹` | Currency symbol |
| `AQUATRACE_TANK_CAPACITY` | `50000` | Tank capacity in litres |
| `AQUATRACE_MIN_EXCESS_LPH` | `8` | Minimum excess to flag |
| `AQUATRACE_CORS_ORIGIN_REGEX` | `https://[a-z0-9-]+\.vercel\.app` | Allowed browser origins |
| `AQUATRACE_AUTOSTART` | `false` | Start the simulator on boot |

The frontend reads `VITE_API_URL` (default `http://localhost:8000`).

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
| GET | `/api/ai/status`, POST `/api/ai/retrain` | Model status and retrain |
| GET | `/api/incidents`, `/api/incidents/{id}` | Incidents and detail |
| POST | `/api/incidents/{id}/{acknowledge,in-progress,resolve,false-positive}` | Lifecycle |
| GET | `/api/recommendations` | Prioritised actions |
| GET | `/api/tank/status` | Tank and reserve planning |
| POST/GET | `/api/benchmarks/run`, `/latest` | Benchmark run and results |
| GET | `/api/export/telemetry`, `/incidents` | CSV and JSON export |

---

## Deployment

The project is deployed as two services:

- **Frontend on Vercel** (static Vite build). `frontend/vercel.json` handles the
  SPA rewrite, and the API URL is set with the `VITE_API_URL` environment
  variable.
- **Backend on Render** (FastAPI). `render.yaml` describes the service, and
  `AQUATRACE_AUTOSTART=1` starts the simulator on boot so the dashboard has live
  data immediately.

The Render service keeps the SQLite database inside its own container, so data
resets on each deploy. This is fine for a simulator and keeps the demo simple.

## Notes for judges

- Start with the **Executive Cockpit**, then open **Simulation Lab** and run the
  **guided demo** to see the whole pipeline end to end.
- Open **Settings → Benchmarks** to see detection metrics next to simple
  baselines, clearly labelled as simulation results.
- Open **Settings → AI Engine** to see the model metadata and the live residual
  and localisation view.

## License and attribution

Built as a hackathon project. AquaTrace is a simulator and decision-support
demonstrator, not a certified leak-detection system.
