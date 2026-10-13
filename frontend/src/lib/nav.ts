import {
  Building2,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

// Primary navigation is deliberately limited to the five operational roles plus
// Settings. Everything else (model diagnostics, benchmarks, tank planning) lives
// inside Settings so daily operators are not exposed to data-science tooling.
export const NAV: NavItem[] = [
  {
    to: "/",
    label: "Executive Cockpit",
    title: "Executive Cockpit",
    subtitle: "Water balance, tanker autonomy and today's savings",
    icon: LayoutDashboard,
  },
  {
    to: "/twin",
    label: "Spatial Twin",
    title: "Spatial digital twin",
    subtitle: "3D building model and hydraulic pipe topology",
    icon: Layers,
  },
  {
    to: "/incidents",
    label: "Incidents & Dispatch",
    title: "Incidents and dispatch",
    subtitle: "Room localisation, valve isolation and work orders",
    icon: ShieldAlert,
  },
  {
    to: "/departments",
    label: "Department Savings",
    title: "Department savings",
    subtitle: "Rooms, laundry and kitchen recommendations",
    icon: Building2,
  },
  {
    to: "/simulation",
    label: "Simulation Lab",
    title: "Simulation and stress lab",
    subtitle: "Scenario injection and playback control",
    icon: FlaskConical,
  },
  {
    to: "/settings",
    label: "Settings",
    title: "Settings",
    subtitle: "Configuration, diagnostics and exports",
    icon: SettingsIcon,
  },
];

// Titles for secondary routes reachable from Settings, so the header stays
// accurate when the user is not on a primary tab.
export const ROUTE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/monitor": { title: "Live monitor", subtitle: "Node readings against the expected band" },
  "/network": { title: "Pipe topology", subtitle: "Distribution topology and live node state" },
  "/ai": { title: "AI engine", subtitle: "Model, detector pipeline and localisation" },
  "/benchmarks": { title: "Benchmarks", subtitle: "Detector metrics against baselines" },
  "/tank": { title: "Tank planning", subtitle: "Reserve coverage and refill planning" },
};

export function routeMeta(pathname: string): { title: string; subtitle: string } {
  const primary = NAV.find((n) => n.to === pathname);
  if (primary) return { title: primary.title, subtitle: primary.subtitle };
  return ROUTE_TITLES[pathname] ?? { title: "AquaTrace", subtitle: "Water intelligence console" };
}
