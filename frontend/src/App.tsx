import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { Toaster } from "./components/ui/Toaster";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { Overview } from "./pages/Overview";
import { LiveMonitor } from "./pages/LiveMonitor";
import { WaterNetwork } from "./pages/WaterNetwork";
import { AIIntelligence } from "./pages/AIIntelligence";
import { Incidents } from "./pages/Incidents";
import { SimulationLab } from "./pages/SimulationLab";
import { Benchmarks } from "./pages/Benchmarks";
import { TankPlanning } from "./pages/TankPlanning";
import { Settings } from "./pages/Settings";

function Layout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-app text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto px-5 py-5">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="monitor" element={<LiveMonitor />} />
        <Route path="network" element={<WaterNetwork />} />
        <Route path="ai" element={<AIIntelligence />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="simulation" element={<SimulationLab />} />
        <Route path="benchmarks" element={<Benchmarks />} />
        <Route path="tank" element={<TankPlanning />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
