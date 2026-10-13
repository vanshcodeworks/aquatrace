import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "../api/client";
import type {
  LatestTelemetry,
  NetworkTopology,
  Scenario,
  SimulationState,
} from "../api/types";

interface SimContextValue {
  state: SimulationState | null;
  latest: LatestTelemetry | null;
  topology: NetworkTopology | null;
  scenarios: Scenario[];
  connected: boolean;
  loading: boolean;
  actionPending: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  step: () => Promise<void>;
  reset: (seed?: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  selectScenario: (scenario: string, nodeId?: string | null, intensity?: number) => Promise<void>;
  injectFault: (payload: Record<string, unknown>) => Promise<void>;
  removeFault: (payload: { fault_db_id?: number; node_id?: string }) => Promise<void>;
  runDemo: () => Promise<void>;
  remediation: () => Promise<void>;
}

const SimContext = createContext<SimContextValue | null>(null);

const POLL_MS = 1500;

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SimulationState | null>(null);
  const [latest, setLatest] = useState<LatestTelemetry | null>(null);
  const [topology, setTopology] = useState<NetworkTopology | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [st, lt] = await Promise.all([api.state(), api.latest()]);
      setState(st);
      setLatest(lt);
      setConnected(true);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      setConnected(false);
      setError(err instanceof ApiError ? err.message : "Backend unavailable");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [topo, sc] = await Promise.all([api.network(), api.scenarios()]);
        if (!cancelled) {
          setTopology(topo);
          setScenarios(sc.scenarios);
        }
      } catch {
        /* handled by refresh */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setActionPending(true);
      try {
        await fn();
        await refresh();
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Action failed");
      } finally {
        setActionPending(false);
      }
    },
    [refresh],
  );

  const value = useMemo<SimContextValue>(
    () => ({
      state,
      latest,
      topology,
      scenarios,
      connected,
      loading,
      actionPending,
      error,
      lastUpdated,
      refresh,
      start: () => runAction(() => api.start()),
      pause: () => runAction(() => api.pause()),
      stop: () => runAction(() => api.stop()),
      step: () => runAction(() => api.step()),
      reset: (seed) => runAction(() => api.reset(seed !== undefined ? { seed } : {})),
      setSpeed: (speed) => runAction(() => api.setSpeed(speed)),
      selectScenario: (scenario, nodeId, intensity) =>
        runAction(() => api.selectScenario({ scenario, node_id: nodeId ?? null, intensity_lph: intensity })),
      injectFault: (payload) => runAction(() => api.injectFault(payload)),
      removeFault: (payload) => runAction(() => api.removeFault(payload)),
      runDemo: () => runAction(() => api.runLeakDemo()),
      remediation: () => runAction(() => api.remediation()),
    }),
    [state, latest, topology, scenarios, connected, loading, actionPending, error, lastUpdated, refresh, runAction],
  );

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSimulation(): SimContextValue {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSimulation must be used within SimulationProvider");
  return ctx;
}
