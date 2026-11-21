import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { BRAND } from '../../config/brand';
import { getMapStyle } from '../../config/providers';
import { buildLaneSpatialIndex, normalizeAngleDiff } from '../../engine/geo';
import { useAppStore } from '../../store/useAppStore';
import type { LngLat } from '../../types';

const SRC_LANES = 'ev-ciclomapa-lanes';
const SRC_POIS = 'ev-ciclomapa-pois';
const SRC_ALT_ROUTES = 'ev-alt-routes';
const SRC_ACTIVE_ROUTE = 'ev-active-route';
const SRC_COMPLETED_ROUTE = 'ev-completed-route';

export function EixoVerdeMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const lanesDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const poisDataRef = useRef<GeoJSON.FeatureCollection | null>(null);

  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const crossingMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hazardMarkersRef = useRef<maplibregl.Marker[]>([]);
  const savedPlaceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const contextPinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const smoothedHeadingRef = useRef<number | null>(null);

  const theme = useAppStore((s) => s.theme);
  const basemap = useAppStore((s) => s.basemap);
  const mode = useAppStore((s) => s.mode);
  const showBikeLanes = useAppStore((s) => s.showBikeLanes);
  const showPois = useAppStore((s) => s.showPois);
  const showHazards = useAppStore((s) => s.showHazards);
  const candidates = useAppStore((s) => s.candidates);
  const selectedCandidateIdx = useAppStore((s) => s.selectedCandidateIdx);
  const isEditingWaypoints = useAppStore((s) => s.isEditingWaypoints);
  const mapPickTarget = useAppStore((s) => s.mapPickTarget);
  const hazards = useAppStore((s) => s.hazards);
  const savedPlaces = useAppStore((s) => s.savedPlaces);
  const mapContextPin = useAppStore((s) => s.mapContextPin);
  const hoverCoordIndex = useAppStore((s) => s.hoverCoordIndex);
  const fitBoundsNonce = useAppStore((s) => s.fitBoundsNonce);
  const flyToTarget = useAppStore((s) => s.flyToTarget);
  const nav = useAppStore((s) => s.nav);

  // Helper to attach EixoVerde vector sources & layers after every style load
  const attachOverlayLayers = (map: maplibregl.Map) => {
    const isDark = useAppStore.getState().theme === 'dark';
    const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

    if (!map.getSource(SRC_LANES)) {
      map.addSource(SRC_LANES, {
        type: 'geojson',
        data: lanesDataRef.current ?? emptyFC,
      });
    }
    if (!map.getSource(SRC_POIS)) {
      map.addSource(SRC_POIS, {
        type: 'geojson',
        data: poisDataRef.current ?? emptyFC,
      });
    }
    if (!map.getSource(SRC_ALT_ROUTES)) {
      map.addSource(SRC_ALT_ROUTES, { type: 'geojson', data: emptyFC });
    }
    if (!map.getSource(SRC_ACTIVE_ROUTE)) {
      map.addSource(SRC_ACTIVE_ROUTE, { type: 'geojson', data: emptyFC });
    }
    if (!map.getSource(SRC_COMPLETED_ROUTE)) {
      map.addSource(SRC_COMPLETED_ROUTE, { type: 'geojson', data: emptyFC });
    }

    const laneVis = useAppStore.getState().showBikeLanes ? 'visible' : 'none';
    const poiVis = useAppStore.getState().showPois ? 'visible' : 'none';

    // 1. Prohibited high-speed roads (subtle warning at zoom >= 13)
    if (!map.getLayer('ev-lanes-proibido')) {
      map.addLayer({
        id: 'ev-lanes-proibido',
        type: 'line',
        source: SRC_LANES,
        minzoom: 12.5,
        filter: ['==', ['get', 'kind'], 'proibido'],
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: laneVis },
        paint: {
          'line-color': '#ef4444',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 1.5, 16, 3.2],
          'line-opacity': 0.35,
          'line-dasharray': [2, 2],
        },
      });
    }

    // 2. Low-speed calm streets & trails
    if (!map.getLayer('ev-lanes-calm')) {
      map.addLayer({
        id: 'ev-lanes-calm',
        type: 'line',
        source: SRC_LANES,
        minzoom: 12,
        filter: ['in', ['get', 'kind'], ['literal', ['baixa_velocidade', 'trilha', 'calcada']]],
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: laneVis },
        paint: {
          'line-color': [
            'match',
            ['get', 'kind'],
            'trilha',
            '#d97706',
            'calcada',
            '#06b6d4',
            '#14b8a6',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.4, 16, 3.2],
          'line-opacity': isDark ? 0.6 : 0.55,
          'line-dasharray': [2.2, 1.8],
        },
      });
    }

    // 3. Dedicated Ciclovias & Ciclofaixas (casing + bright core)
    if (!map.getLayer('ev-lanes-dedicated-casing')) {
      map.addLayer({
        id: 'ev-lanes-dedicated-casing',
        type: 'line',
        source: SRC_LANES,
        filter: ['in', ['get', 'kind'], ['literal', ['ciclovia', 'ciclofaixa']]],
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: laneVis },
        paint: {
          'line-color': isDark ? '#022c22' : '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5.2, 17, 7.5],
          'line-opacity': 0.78,
        },
      });
    }

    if (!map.getLayer('ev-lanes-dedicated')) {
      map.addLayer({
        id: 'ev-lanes-dedicated',
        type: 'line',
        source: SRC_LANES,
        filter: ['in', ['get', 'kind'], ['literal', ['ciclovia', 'ciclofaixa']]],
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: laneVis },
        paint: {
          'line-color': [
            'match',
            ['get', 'kind'],
            'ciclofaixa',
            '#0ea5e9',
            '#10b981',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3.2, 17, 4.8],
          'line-opacity': 0.92,
        },
      });
    }

    // 4. Cycling POIs (racks, repair shops, stations)
    if (!map.getLayer('ev-pois-circle')) {
      map.addLayer({
        id: 'ev-pois-circle',
        type: 'circle',
        source: SRC_POIS,
        minzoom: 12.8,
        layout: { visibility: poiVis },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.8, 3.8, 16, 6.8],
          'circle-color': [
            'match',
            ['get', 'kind'],
            'oficina',
            '#f59e0b',
            'estacao',
            '#0284c7',
            '#10b981',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': isDark ? '#0f172a' : '#ffffff',
        },
      });
    }

    // 5. Alternative route candidates (clickable like Waze / Google Maps)
    if (!map.getLayer('ev-alt-routes-casing')) {
      map.addLayer({
        id: 'ev-alt-routes-casing',
        type: 'line',
        source: SRC_ALT_ROUTES,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isDark ? '#0f172a' : '#ffffff',
          'line-width': 9,
          'line-opacity': 0.8,
        },
      });
    }
    if (!map.getLayer('ev-alt-routes-line')) {
      map.addLayer({
        id: 'ev-alt-routes-line',
        type: 'line',
        source: SRC_ALT_ROUTES,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isDark ? '#64748b' : '#94a3b8',
          'line-width': 5.5,
          'line-opacity': 0.85,
        },
      });
    }

    // 6. Active selected route (bold Waze/Google Maps emerald-sky ribbon)
    if (!map.getLayer('ev-active-route-casing')) {
      map.addLayer({
        id: 'ev-active-route-casing',
        type: 'line',
        source: SRC_ACTIVE_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isDark ? '#022c22' : '#064e3b',
          'line-width': 11,
          'line-opacity': 0.92,
        },
      });
    }
    if (!map.getLayer('ev-active-route-line')) {
      map.addLayer({
        id: 'ev-active-route-line',
        type: 'line',
        source: SRC_ACTIVE_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#22c55e',
          'line-width': 6.5,
          'line-opacity': 1,
        },
      });
    }

    // 7. Completed portion during live navigation
    if (!map.getLayer('ev-completed-route-line')) {
      map.addLayer({
        id: 'ev-completed-route-line',
        type: 'line',
        source: SRC_COMPLETED_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isDark ? '#475569' : '#94a3b8',
          'line-width': 6.5,
          'line-opacity': 0.78,
        },
      });
    }
  };

  // Sync route GeoJSON into MapLibre sources
  const syncRoutesToMap = (map: maplibregl.Map) => {
    if (!styleReadyRef.current) return;
    const state = useAppStore.getState();
    const { candidates: cands, selectedCandidateIdx: selIdx, mode: curMode, nav: curNav } = state;

    const altSrc = map.getSource(SRC_ALT_ROUTES) as maplibregl.GeoJSONSource | undefined;
    const actSrc = map.getSource(SRC_ACTIVE_ROUTE) as maplibregl.GeoJSONSource | undefined;
    const compSrc = map.getSource(SRC_COMPLETED_ROUTE) as maplibregl.GeoJSONSource | undefined;
    if (!altSrc || !actSrc || !compSrc) return;

    const altFeatures: GeoJSON.Feature[] =
      curMode === 'navigate'
        ? []
        : cands
            .map((c, idx) => ({ c, idx }))
            .filter(({ idx }) => idx !== selIdx)
            .map(({ c, idx }) => ({
              type: 'Feature',
              properties: { candidateIdx: idx, profile: c.profile },
              geometry: {
                type: 'LineString',
                coordinates: c.coords.map((pt) => [pt[0], pt[1]]),
              },
            }));

    altSrc.setData({ type: 'FeatureCollection', features: altFeatures });

    const active = cands[selIdx];
    if (!active || active.coords.length < 2) {
      actSrc.setData({ type: 'FeatureCollection', features: [] });
      compSrc.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const lineCoords = active.coords.map((pt) => [pt[0], pt[1]]);
    actSrc.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { profile: active.profile },
          geometry: { type: 'LineString', coordinates: lineCoords },
        },
      ],
    });

    // Split completed segment when navigating
    if (curMode === 'navigate' && curNav.distanceAlongM > 15) {
      const totalM = Math.max(1, active.distanceKm * 1000);
      const ratio = Math.min(1, curNav.distanceAlongM / totalM);
      const splitIdx = Math.max(2, Math.floor(ratio * lineCoords.length));
      compSrc.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: lineCoords.slice(0, splitIdx) },
          },
        ],
      });
    } else {
      compSrc.setData({ type: 'FeatureCollection', features: [] });
    }
  };

  // Initialize MapLibre instance once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initial = useAppStore.getState();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(initial.theme, initial.basemap) as maplibregl.StyleSpecification | string,
      center: BRAND.defaultCenter,
      zoom: BRAND.defaultZoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 68,
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    const onStyleLoad = () => {
      styleReadyRef.current = true;
      attachOverlayLayers(map);
      syncRoutesToMap(map);
    };

    map.on('style.load', onStyleLoad);

    // Fetch slimmed DF CicloMapa GeoJSON files in background
    const baseUrl = import.meta.env.BASE_URL || '/';
    Promise.all([
      fetch(`${baseUrl}data/ciclomapa-df-lanes.geojson`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${baseUrl}data/ciclomapa-df-pois.geojson`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([lanes, pois]) => {
        if (lanes) {
          lanesDataRef.current = lanes;
          buildLaneSpatialIndex(lanes);
          const src = map.getSource(SRC_LANES) as maplibregl.GeoJSONSource | undefined;
          src?.setData(lanes);
        }
        if (pois) {
          poisDataRef.current = pois;
          const src = map.getSource(SRC_POIS) as maplibregl.GeoJSONSource | undefined;
          src?.setData(pois);
        }
      })
      .catch(() => {
        // Offline or missing static files — map still works cleanly
      });

    // Click alternative route directly on map to select it
    map.on('click', 'ev-alt-routes-line', (e) => {
      const idx = e.features?.[0]?.properties?.candidateIdx;
      if (typeof idx === 'number') {
        useAppStore.getState().selectCandidate(idx);
      }
    });

    // Click POI circle to show crisp popup
    map.on('click', 'ev-pois-circle', (e) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const props = feat.properties as { name?: string; label?: string; kind?: string };
      const coords = feat.geometry.coordinates as LngLat;
      const badge =
        props.kind === 'oficina' ? '🔧 Oficina / Loja' : props.kind === 'estacao' ? '🚲 Estação' : '🅿️ Bicicletário';
      new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 12 })
        .setLngLat(coords)
        .setHTML(
          `<div style="font-family:Inter,sans-serif;padding:2px 0">
             <div style="font-size:11px;font-weight:700;color:#059669;margin-bottom:2px">${badge}</div>
             <div style="font-size:13px;font-weight:600;color:#0f172a">${props.name || props.label || 'Ponto Cicloviário'}</div>
           </div>`
        )
        .addTo(map);
    });

    // Click bike lane to inspect name/kind when not picking a waypoint
    map.on('click', 'ev-lanes-dedicated', (e) => {
      const st = useAppStore.getState();
      if (st.mapPickTarget || st.isEditingWaypoints || st.mode === 'navigate') return;
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties as { name?: string; label?: string; kind?: string };
      new maplibregl.Popup({ closeButton: false, maxWidth: '230px', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family:Inter,sans-serif;padding:2px 0">
             <div style="font-size:11px;font-weight:700;color:${props.kind === 'ciclofaixa' ? '#0284c7' : '#059669'}">${props.label || 'Ciclovia'}</div>
             <div style="font-size:12px;font-weight:600;color:#0f172a">${props.name || 'Malha Cicloviária DF'}</div>
           </div>`
        )
        .addTo(map);
    });

    // General map click for picking origin/dest/via/hazard or dismissing context popup
    map.on('click', (e) => {
      const st = useAppStore.getState();
      if (st.mapPickTarget || st.isEditingWaypoints) {
        void st.handleMapClick([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]);
        return;
      }
      if (st.mapContextPin) {
        st.closeMapContextPin();
      }
    });

    // Desktop right-click -> open Waze-style quick place popup
    map.on('contextmenu', (e) => {
      const st = useAppStore.getState();
      if (st.mode === 'navigate') return;
      e.preventDefault();
      void st.openMapContextPin([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]);
    });

    // Mobile long-press (~450ms single-finger hold) -> open quick place popup
    const canvas = map.getCanvas();
    let longPressTimer: number | null = null;
    let pressStartPt: { x: number; y: number } | null = null;

    const cancelLongPress = () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      pressStartPt = null;
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) {
        cancelLongPress();
        return;
      }
      const st = useAppStore.getState();
      if (st.mode === 'navigate' || st.mapPickTarget) return;
      const touch = ev.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      pressStartPt = { x, y };

      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        if (!pressStartPt) return;
        const lngLat = map.unproject([pressStartPt.x, pressStartPt.y]);
        if (navigator.vibrate) {
          try {
            navigator.vibrate(18);
          } catch {
            // Ignore
          }
        }
        void useAppStore.getState().openMapContextPin([+lngLat.lng.toFixed(6), +lngLat.lat.toFixed(6)]);
      }, 450);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (!pressStartPt || ev.touches.length !== 1) {
        cancelLongPress();
        return;
      }
      const touch = ev.touches[0];
      const rect = canvas.getBoundingClientRect();
      const dx = touch.clientX - rect.left - pressStartPt.x;
      const dy = touch.clientY - rect.top - pressStartPt.y;
      if (dx * dx + dy * dy > 100) {
        cancelLongPress();
      }
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', cancelLongPress, { passive: true });
    canvas.addEventListener('touchcancel', cancelLongPress, { passive: true });

    // If user drags map during live nav, pause auto-follow so they can pan freely
    map.on('dragstart', () => {
      cancelLongPress();
      const st = useAppStore.getState();
      if (st.mode === 'navigate' && st.nav.followUser) {
        st.updateNavTelemetry({ followUser: false });
      }
    });
    map.on('zoomstart', cancelLongPress);

    // Hover cursor feedback
    ['ev-alt-routes-line', 'ev-pois-circle', 'ev-lanes-dedicated'].forEach((layerId) => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = useAppStore.getState().mapPickTarget ? 'crosshair' : '';
      });
    });

    return () => {
      cancelLongPress();
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', cancelLongPress);
      canvas.removeEventListener('touchcancel', cancelLongPress);
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
  }, []);

  // Update map style on theme / basemap changes
  const prevStyleKeyRef = useRef(`${theme}-${basemap}`);
  useEffect(() => {
    const map = mapRef.current;
    const nextKey = `${theme}-${basemap}`;
    if (!map || prevStyleKeyRef.current === nextKey) return;
    prevStyleKeyRef.current = nextKey;
    styleReadyRef.current = false;
    map.setStyle(getMapStyle(theme, basemap) as maplibregl.StyleSpecification | string);
  }, [theme, basemap]);

  // Cursor when picking a point on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mapPickTarget || isEditingWaypoints ? 'crosshair' : '';
  }, [mapPickTarget, isEditingWaypoints]);

  // Toggle bike lanes / POIs visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    const laneVis = showBikeLanes ? 'visible' : 'none';
    ['ev-lanes-proibido', 'ev-lanes-calm', 'ev-lanes-dedicated-casing', 'ev-lanes-dedicated'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', laneVis);
    });
    if (map.getLayer('ev-pois-circle')) {
      map.setLayoutProperty('ev-pois-circle', 'visibility', showPois ? 'visible' : 'none');
    }
  }, [showBikeLanes, showPois]);

  // Sync routes whenever candidates, selected index, mode, or nav progress changes
  useEffect(() => {
    const map = mapRef.current;
    if (map) syncRoutesToMap(map);
  }, [candidates, selectedCandidateIdx, mode, nav.distanceAlongM]);

  // Fit bounds smoothly when a new route is calculated or loaded
  useEffect(() => {
    const map = mapRef.current;
    const active = candidates[selectedCandidateIdx];
    if (!map || !active || active.coords.length < 2 || fitBoundsNonce === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    active.coords.forEach((c) => bounds.extend([c[0], c[1]]));

    const isDesktop = window.innerWidth >= 1024;
    map.fitBounds(bounds, {
      padding: isDesktop
        ? { top: 88, bottom: 90, left: 430, right: 80 }
        : { top: 96, bottom: 320, left: 42, right: 42 },
      duration: 750,
      pitch: 0,
      bearing: 0,
    });
  }, [fitBoundsNonce]);

  // Fly to searched/selected place
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo({
      center: flyToTarget.coords,
      zoom: flyToTarget.zoom ?? 15,
      duration: 750,
    });
  }, [flyToTarget]);

  // Render Waypoint & Arterial Crossing Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];
    crossingMarkersRef.current.forEach((m) => m.remove());
    crossingMarkersRef.current = [];

    const active = candidates[selectedCandidateIdx];
    if (!active) return;

    // Waypoint markers (draggable when editing or previewing)
    active.waypoints.forEach((wp, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === active.waypoints.length - 1;
      const el = document.createElement('div');
      el.className = 'flex items-center justify-center shadow-lg select-none transition-transform';
      if (isStart) {
        el.innerHTML = `<div style="width:28px;height:28px;border-radius:999px;background:#059669;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.28)">A</div>`;
      } else if (isEnd) {
        el.innerHTML = `<div style="width:28px;height:28px;border-radius:999px;background:#0f172a;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.28)">B</div>`;
      } else {
        el.innerHTML = `<div style="width:22px;height:22px;border-radius:999px;background:#0284c7;color:#fff;font-weight:700;font-size:10px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.25);cursor:grab">${idx}</div>`;
      }

      const draggable = mode !== 'navigate' && (isEditingWaypoints || (!isStart && !isEnd));
      const marker = new maplibregl.Marker({ element: el, draggable }).setLngLat(wp).addTo(map);
      if (draggable) {
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          void useAppStore.getState().updateWaypoint(idx, [+ll.lng.toFixed(6), +ll.lat.toFixed(6)]);
        });
      }
      waypointMarkersRef.current.push(marker);
    });

    // Arterial crossing danger pills
    active.crossings.forEach((c) => {
      const el = document.createElement('div');
      el.innerHTML = `<div style="background:${c.danger === 'alta' ? '#dc2626' : '#d97706'};color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.3);white-space:nowrap;cursor:pointer">⚠ ${c.shortTag}</div>`;
      const popup = new maplibregl.Popup({ offset: 14, maxWidth: '240px' }).setHTML(
        `<div style="font-family:Inter,sans-serif">
           <div style="font-size:11px;font-weight:800;color:#dc2626">TRAVESSIA DE ATENÇÃO</div>
           <div style="font-size:13px;font-weight:700;color:#0f172a;margin:2px 0">${c.name}</div>
           <div style="font-size:12px;color:#475569;line-height:1.35">${c.note}</div>
         </div>`
      );
      const marker = new maplibregl.Marker({ element: el }).setLngLat(c.coords).setPopup(popup).addTo(map);
      crossingMarkersRef.current.push(marker);
    });
  }, [candidates, selectedCandidateIdx, isEditingWaypoints, mode]);

  // Render Waze-style Local Hazard Pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    hazardMarkersRef.current.forEach((m) => m.remove());
    hazardMarkersRef.current = [];
    if (!showHazards) return;

    const iconMap: Record<string, string> = {
      buraco: '🕳️',
      bloqueio: '🚧',
      iluminacao: '💡',
      raizes: '🌳',
      cruzamento: '⚠️',
      agua: '💧',
    };

    hazards.forEach((h) => {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:30px;height:30px;border-radius:10px;background:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer">${iconMap[h.kind] ?? '⚠️'}</div>`;
      const popup = new maplibregl.Popup({ offset: 16, maxWidth: '230px' }).setHTML(
        `<div style="font-family:Inter,sans-serif">
           <div style="font-size:10px;font-weight:800;color:#d97706;text-transform:uppercase">Alerta da Comunidade (Local)</div>
           <div style="font-size:13px;font-weight:700;color:#0f172a;margin:2px 0">${h.title}</div>
           ${h.note ? `<div style="font-size:12px;color:#475569">${h.note}</div>` : ''}
         </div>`
      );
      const marker = new maplibregl.Marker({ element: el }).setLngLat(h.coords).setPopup(popup).addTo(map);
      hazardMarkersRef.current.push(marker);
    });
  }, [hazards, showHazards]);

  // Render Saved Places (Casa, Trabalho, Favoritos) pins on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    savedPlaceMarkersRef.current.forEach((m) => m.remove());
    savedPlaceMarkersRef.current = [];
    if (mode === 'navigate') return;

    savedPlaces.forEach((sp) => {
      const bg = sp.category === 'home' ? '#059669' : sp.category === 'work' ? '#0284c7' : '#d97706';
      const icon = sp.category === 'home' ? '🏠' : sp.category === 'work' ? '💼' : '⭐';
      const el = document.createElement('div');
      el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;background:${bg};color:#fff;font-family:Inter,sans-serif;font-size:11px;font-weight:700;padding:3px 8px 3px 6px;border-radius:999px;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.28);cursor:pointer;white-space:nowrap"><span>${icon}</span><span>${sp.label.slice(0, 18)}</span></div>`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        void useAppStore.getState().setDestination(
          {
            id: sp.id,
            name: sp.label,
            subtitle: sp.address,
            coords: sp.coords,
            source: 'curated',
          },
          true
        );
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat(sp.coords).addTo(map);
      savedPlaceMarkersRef.current.push(marker);
    });
  }, [savedPlaces, mode]);

  // Elevation chart hover synced marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const active = candidates[selectedCandidateIdx];
    if (hoverCoordIndex === null || !active || !active.coords[hoverCoordIndex]) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }
    const pt = active.coords[hoverCoordIndex];
    if (!hoverMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:16px;height:16px;border-radius:999px;background:#0284c7;border:3px solid #fff;box-shadow:0 2px 10px rgba(2,132,199,0.55)"></div>`;
      hoverMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([pt[0], pt[1]]).addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat([pt[0], pt[1]]);
    }
  }, [hoverCoordIndex, candidates, selectedCandidateIdx]);

  // Long-press / Right-click dropped target pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!mapContextPin || mode === 'navigate') {
      contextPinMarkerRef.current?.remove();
      contextPinMarkerRef.current = null;
      return;
    }

    if (!contextPinMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.innerHTML = `
        <div class="gps-pulse-ring" style="position:absolute;width:36px;height:36px;border-radius:999px;background:rgba(244,63,94,0.32)"></div>
        <div style="width:26px;height:26px;border-radius:999px 999px 999px 4px;transform:rotate(-45deg);background:#f43f5e;border:3px solid #ffffff;box-shadow:0 6px 16px rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center">
          <div style="width:8px;height:8px;border-radius:999px;background:#ffffff"></div>
        </div>
      `;
      contextPinMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(mapContextPin.coords)
        .addTo(map);
    } else {
      contextPinMarkerRef.current.setLngLat(mapContextPin.coords);
    }
  }, [mapContextPin, mode]);

  // Live GPS / Demo Navigation Puck & Silky Camera Follow
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!nav.currentPos) {
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      smoothedHeadingRef.current = null;
      return;
    }

    if (!gpsMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center';
      el.innerHTML = `
        <div class="gps-pulse-ring" style="position:absolute;width:44px;height:44px;border-radius:999px;background:rgba(16,185,129,0.28)"></div>
        <div data-puck-arrow style="width:34px;height:34px;border-radius:999px;background:#059669;border:3px solid #ffffff;box-shadow:0 6px 16px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;transition:transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2L19 21L12 17L5 21L12 2Z"/></svg>
        </div>
      `;
      gpsMarkerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat(nav.currentPos)
        .addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat(nav.currentPos);
    }

    // Apply gentle exponential low-pass angular smoothing so curves & compass turns glide cleanly
    const prevHeading = smoothedHeadingRef.current;
    const smoothHeading =
      prevHeading === null
        ? nav.currentHeading
        : (prevHeading + normalizeAngleDiff(nav.currentHeading - prevHeading) * 0.45 + 360) % 360;
    smoothedHeadingRef.current = smoothHeading;

    const arrow = gpsMarkerRef.current.getElement().querySelector('[data-puck-arrow]') as HTMLElement | null;
    if (arrow) {
      arrow.style.transform = `rotate(${smoothHeading}deg)`;
    }

    if (mode === 'navigate' && nav.followUser) {
      const targetPitch = nav.pitch3D ? 56 : 0;
      map.easeTo({
        center: nav.currentPos,
        zoom: Math.max(map.getZoom(), 16.4),
        bearing: smoothHeading,
        pitch: targetPitch,
        duration: 360,
        easing: (t) => 1 - Math.pow(1 - t, 3),
      });
    }
  }, [nav.currentPos, nav.currentHeading, nav.followUser, mode]);

  // Dedicated 3D / 2D Camera Toggle (flat pitch 0 in 2D while still keeping live heading rotation)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mode === 'navigate') {
      map.stop();
      const heading = smoothedHeadingRef.current ?? useAppStore.getState().nav.currentHeading;
      if (nav.pitch3D) {
        map.touchPitch.enable();
        map.easeTo({
          pitch: 56,
          bearing: heading,
          duration: 360,
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
      } else {
        // Flat 2D top-down view that still rotates smoothly with phone compass / heading
        map.touchPitch.disable();
        map.jumpTo({ pitch: 0, bearing: heading });
      }
    } else {
      map.touchPitch.enable();
      smoothedHeadingRef.current = null;
      if (map.getPitch() > 2 || Math.abs(map.getBearing()) > 1) {
        map.easeTo({ pitch: 0, bearing: 0, duration: 480, easing: (t) => 1 - Math.pow(1 - t, 3) });
      }
    }
  }, [nav.pitch3D, mode]);

  return (
    <div
      ref={containerRef}
      id="eixoverde-map-canvas"
      className="fixed inset-0 h-full w-full"
      aria-label="Mapa interativo EixoVerde"
    />
  );
}
