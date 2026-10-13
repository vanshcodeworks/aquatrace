import { NavLink } from "react-router-dom";
import { NAV } from "../../lib/nav";
import { useSimulation } from "../../store/SimulationContext";

export function Sidebar() {
  const { connected, state } = useSimulation();
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-line bg-app2">
      <div className="flex h-12 items-center border-b border-line px-4">
        <span className="text-[13px] font-semibold tracking-tight text-ink">AquaTrace</span>
        <span className="ml-2 rounded-sm border border-line px-1 py-px font-mono text-[10px] text-dim">
          v1.0
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-1.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `relative flex items-center gap-2.5 px-4 py-[7px] text-[13px] ${
                  isActive
                    ? "bg-elevated text-ink"
                    : "text-muted hover:bg-elevated/60 hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="absolute inset-y-0 left-0 w-0.5 bg-teal" />
                  ) : null}
                  <Icon size={15} className={isActive ? "text-teal" : "text-dim"} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`inline-block h-2 w-2 rounded-sm ${connected ? "bg-healthy" : "bg-critical"}`}
          />
          <span className="text-muted">{connected ? "Connected" : "Backend offline"}</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-dim">
          {state?.data_source ?? "SIMULATED"} source
        </p>
      </div>
    </aside>
  );
}
