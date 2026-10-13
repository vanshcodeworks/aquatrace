import {
  Activity,
  BarChart3,
  Brain,
  Droplets,
  FlaskConical,
  LayoutDashboard,
  Network,
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

export const NAV: NavItem[] = [
  {
    to: "/",
    label: "Overview",
    title: "Overview",
    subtitle: "Water balance, open incidents, AI status",
    icon: LayoutDashboard,
  },
  {
    to: "/monitor",
    label: "Live monitor",
    title: "Live monitor",
    subtitle: "Node readings against the expected band",
    icon: Activity,
  },
  {
    to: "/network",
    label: "Network",
    title: "Water network",
    subtitle: "Distribution topology and live node state",
    icon: Network,
  },
  {
    to: "/ai",
    label: "AI engine",
    title: "AI engine",
    subtitle: "Model, detector pipeline and localisation",
    icon: Brain,
  },
  {
    to: "/incidents",
    label: "Incidents",
    title: "Incidents",
    subtitle: "Diagnosis, timeline and remediation",
    icon: ShieldAlert,
  },
  {
    to: "/simulation",
    label: "Simulation",
    title: "Simulation lab",
    subtitle: "Fault injection and playback control",
    icon: FlaskConical,
  },
  {
    to: "/benchmarks",
    label: "Benchmarks",
    title: "Benchmarks",
    subtitle: "Detector metrics against baselines",
    icon: BarChart3,
  },
  {
    to: "/tank",
    label: "Tank",
    title: "Tank planning",
    subtitle: "Reserve coverage and refill planning",
    icon: Droplets,
  },
  {
    to: "/settings",
    label: "Settings",
    title: "Settings",
    subtitle: "Configuration, exports and notifications",
    icon: SettingsIcon,
  },
];
