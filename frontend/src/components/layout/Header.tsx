import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Building2 } from "lucide-react";
import { NAV, routeMeta } from "../../lib/nav";
import { useNotifications } from "../../store/NotificationContext";

export function Header() {
  const { notifications } = useNotifications();
  const location = useLocation();
  const meta = routeMeta(location.pathname);
  const NavIcon = NAV.find((n) => n.to === location.pathname)?.icon ?? Building2;
  const [bellOpen, setBellOpen] = useState(false);

  const alerts = notifications.filter(
    (n) => n.severity === "critical" || n.severity === "warning",
  );

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-6 backdrop-blur-md">
      {/* Perfect Executive Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Building2 size={13} />
          </div>
          <span>Hillside Resort</span>
        </Link>
        <span className="text-slate-300 font-normal text-xs">/</span>
        <span className="text-xs font-medium text-slate-400 hidden sm:inline">Front Desk</span>
        <span className="text-slate-300 font-normal text-xs hidden sm:inline">/</span>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 bg-slate-100/90 px-2.5 py-1 rounded-lg border border-slate-200/50">
          <NavIcon size={13} className="text-blue-600" />
          <span>{meta.title}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Notifications Bell */}
        <div className="relative">
          <button
            aria-label="Alerts"
            onClick={() => setBellOpen((v) => !v)}
            className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-xs"
          >
            <Bell size={15} />
            {alerts.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white shadow-xs">
                {alerts.length}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Hotel Notifications</span>
                <span className="text-[11px] text-slate-400">{notifications.length} alerts</span>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">No active incidents. Water flow is normal.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {notifications.slice(0, 10).map((n) => (
                    <li key={n.id} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                      <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{n.message}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/incidents"
                onClick={() => setBellOpen(false)}
                className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-blue-600 hover:bg-blue-50/50 rounded-b-2xl"
              >
                Open Incident Desk
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
