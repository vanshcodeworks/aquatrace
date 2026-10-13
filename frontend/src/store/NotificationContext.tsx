import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSimulation } from "./SimulationContext";

export interface AppNotification {
  id: number;
  severity: "info" | "warning" | "critical" | "recovery";
  title: string;
  message: string;
  node_id?: string;
  ts: number;
}

interface NotifContextValue {
  notifications: AppNotification[];
  push: (n: Omit<AppNotification, "id" | "ts">) => void;
  dismiss: (id: number) => void;
  clear: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

const NotifContext = createContext<NotifContextValue | null>(null);

let counter = 1;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const { latest } = useSimulation();
  const prevStates = useRef<Record<string, string>>({});

  const push = useCallback((n: Omit<AppNotification, "id" | "ts">) => {
    setNotifications((prev) => [{ ...n, id: counter++, ts: Date.now() }, ...prev].slice(0, 30));
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  // watch node-state transitions and raise notifications
  useEffect(() => {
    if (!latest) return;
    const next: Record<string, string> = {};
    for (const [id, node] of Object.entries(latest.nodes)) {
      next[id] = node.detector_state;
      const prev = prevStates.current[id];
      if (prev === node.detector_state) continue;
      if (node.detector_state === "CRITICAL" && prev !== "CRITICAL") {
        push({
          severity: "critical",
          title: `${node.node_name} - critical`,
          message: `Persistent excess flow detected (${node.excess_lph.toFixed(1)} L/h above expected).`,
          node_id: id,
        });
      } else if (node.detector_state === "OFFLINE" && prev !== "OFFLINE") {
        push({
          severity: "warning",
          title: `${node.node_name} - sensor offline`,
          message: "No reading available. Localisation confidence is reduced.",
          node_id: id,
        });
      } else if (
        node.detector_state === "HEALTHY" &&
        (prev === "CRITICAL" || prev === "WARNING")
      ) {
        push({
          severity: "recovery",
          title: `${node.node_name} - flow normalised`,
          message: "Readings returned to the expected band.",
          node_id: id,
        });
      }
    }
    prevStates.current = next;
  }, [latest, push]);

  const value = useMemo(
    () => ({ notifications, push, dismiss, clear, soundEnabled, setSoundEnabled }),
    [notifications, push, dismiss, clear, soundEnabled],
  );

  return <NotifContext.Provider value={value}>{children}</NotifContext.Provider>;
}

export function useNotifications(): NotifContextValue {
  const ctx = useContext(NotifContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
