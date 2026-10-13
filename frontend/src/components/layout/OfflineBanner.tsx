import { useSimulation } from "../../store/SimulationContext";

export function OfflineBanner() {
  const { connected, error, loading } = useSimulation();
  if (connected || loading) return null;
  return (
    <div className="border-b border-critical/40 bg-critical/10 px-4 py-1.5 text-[12px] text-critical">
      Backend unreachable{error ? ` (${error})` : ""}. Start the API server; this view reconnects
      automatically.
    </div>
  );
}
