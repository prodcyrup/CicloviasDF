import { useEffect } from 'react';
import { CompareBuyModal } from './components/catalog/CompareBuyModal';
import { VehicleGarageModal } from './components/garage/VehicleGarageModal';
import { EixoVerdeMap } from './components/map/EixoVerdeMap';
import { HazardReportModal } from './components/navigation/HazardReportModal';
import { LiveNavigationOverlay } from './components/navigation/LiveNavigationOverlay';
import { AdaptiveShell } from './components/sheet/AdaptiveShell';
import { AppMenuDrawer } from './components/sheet/AppMenuDrawer';
import { ToastStack } from './components/ui/ToastStack';
import { useAppStore } from './store/useAppStore';

export function App() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const mode = useAppStore((s) => s.mode);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <main className="relative h-full w-full overflow-hidden">
      {/* Single Persistent Full-Screen MapLibre Vector Map */}
      <EixoVerdeMap />

      {/* Unified UI: Seamless transition between Explore/Plan/Preview and Live Handlebar Navigation */}
      {mode === 'navigate' ? <LiveNavigationOverlay /> : <AdaptiveShell />}

      {/* Modals & Drawers */}
      <AppMenuDrawer />
      <VehicleGarageModal />
      <CompareBuyModal />
      <HazardReportModal />
      <ToastStack />
    </main>
  );
}

export default App;
