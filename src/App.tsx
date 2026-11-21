import { Suspense, lazy, useEffect } from 'react';
import { EixoVerdeMap } from './components/map/EixoVerdeMap';
import { AdaptiveShell } from './components/sheet/AdaptiveShell';
import { ToastStack } from './components/ui/ToastStack';
import { useAppStore } from './store/useAppStore';

// Lazy-load secondary modals, drawers, and active navigation overlay to keep initial mobile load fast
const CompareBuyModal = lazy(() =>
  import('./components/catalog/CompareBuyModal').then((m) => ({ default: m.CompareBuyModal }))
);
const VehicleGarageModal = lazy(() =>
  import('./components/garage/VehicleGarageModal').then((m) => ({ default: m.VehicleGarageModal }))
);
const MapContextPopup = lazy(() =>
  import('./components/map/MapContextPopup').then((m) => ({ default: m.MapContextPopup }))
);
const HazardReportModal = lazy(() =>
  import('./components/navigation/HazardReportModal').then((m) => ({ default: m.HazardReportModal }))
);
const LiveNavigationOverlay = lazy(() =>
  import('./components/navigation/LiveNavigationOverlay').then((m) => ({ default: m.LiveNavigationOverlay }))
);
const SavePlaceModal = lazy(() =>
  import('./components/search/SavePlaceModal').then((m) => ({ default: m.SavePlaceModal }))
);
const AppMenuDrawer = lazy(() =>
  import('./components/sheet/AppMenuDrawer').then((m) => ({ default: m.AppMenuDrawer }))
);

export function App() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const mode = useAppStore((s) => s.mode);
  const menuOpen = useAppStore((s) => s.menuOpen);
  const garageOpen = useAppStore((s) => s.garageOpen);
  const compareOpen = useAppStore((s) => s.compareOpen);
  const hazardPickerOpen = useAppStore((s) => s.hazardPickerOpen);
  const pendingSavePlace = useAppStore((s) => s.pendingSavePlace);
  const mapContextPin = useAppStore((s) => s.mapContextPin);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <main className="relative h-full w-full overflow-hidden">
      {/* Single Persistent Full-Screen MapLibre Vector Map */}
      <EixoVerdeMap />

      {/* Unified UI: Seamless transition between Explore/Plan/Preview and Live Handlebar Navigation */}
      {mode === 'navigate' ? (
        <Suspense fallback={null}>
          <LiveNavigationOverlay />
        </Suspense>
      ) : (
        <AdaptiveShell />
      )}

      {/* Lazy-Loaded Modals, Popups & Drawers */}
      <Suspense fallback={null}>
        {mode !== 'navigate' && mapContextPin && <MapContextPopup />}
        {menuOpen && <AppMenuDrawer />}
        {garageOpen && <VehicleGarageModal />}
        {compareOpen && <CompareBuyModal />}
        {hazardPickerOpen && <HazardReportModal />}
        {pendingSavePlace && <SavePlaceModal />}
      </Suspense>

      <ToastStack />
    </main>
  );
}

export default App;
