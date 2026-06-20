import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Waypoint, NoFlyZone, TerrainPoint, FlightPlan, DroneConfig, RouteSnapshot } from '../types';
import {
  aStarPathfind,
  rrtPathfind,
  smoothPath,
  calculateFlightStats,
  checkTerrainCollision,
  exportKML,
  mockNoFlyZones,
  mockTerrainData,
} from '../utils/pathfinding';

export const useDroneStore = defineStore('drone', () => {
  const waypoints = ref<Waypoint[]>([]);
  const noFlyZones = ref<NoFlyZone[]>([]);
  const terrainData = ref<TerrainPoint[]>([]);
  const currentPlan = ref<FlightPlan | null>(null);
  const selectedAlgorithm = ref<'astar' | 'rrt'>('astar');
  const isSimulating = ref(false);
  const simProgress = ref(0);
  const mapCenter = ref<[number, number]>([39.9, 116.4]);

  const droneConfig = ref<DroneConfig>({
    maxAltitude: 500,
    maxSpeed: 20,
    batteryCapacity: 5000,
    consumptionRate: 100,
    safeDistance: 30,
  });

  const routeSnapshot = ref<RouteSnapshot | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function addWaypoint(
    lat: number,
    lng: number,
    altitude = 100,
    speed = 10,
    action: Waypoint['action'] = 'none'
  ) {
    const id = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    waypoints.value.push({ id, lat, lng, altitude, speed, action });
  }

  function removeWaypoint(id: string) {
    waypoints.value = waypoints.value.filter((w) => w.id !== id);
  }

  function updateWaypoint(id: string, updates: Partial<Waypoint>) {
    const wp = waypoints.value.find((w) => w.id === id);
    if (wp) Object.assign(wp, updates);
  }

  function planRoute(start: [number, number], goal: [number, number]) {
    const bounds = { minLat: 39.85, maxLat: 39.95, minLng: 116.35, maxLng: 116.45 };
    let raw: Waypoint[];
    if (selectedAlgorithm.value === 'astar') {
      raw = aStarPathfind(start, goal, 30, noFlyZones.value, bounds);
    } else {
      raw = rrtPathfind(start, goal, noFlyZones.value);
    }
    const smoothed = smoothPath(raw);
    waypoints.value = smoothed;
    updatePlan();
  }

  function cloneWaypoints(list: Waypoint[]): Waypoint[] {
    return list.map((w) => ({ ...w }));
  }

  function clearRoute() {
    routeSnapshot.value = {
      waypoints: cloneWaypoints(waypoints.value),
      currentPlan: currentPlan.value
        ? { ...currentPlan.value, waypoints: cloneWaypoints(currentPlan.value.waypoints) }
        : null,
      simProgress: simProgress.value,
      selectedAlgorithm: selectedAlgorithm.value,
      timestamp: Date.now(),
    };
    waypoints.value = [];
    currentPlan.value = null;
    simProgress.value = 0;
  }

  function restoreRoute() {
    const snap = routeSnapshot.value;
    if (!snap) return;
    waypoints.value = cloneWaypoints(snap.waypoints);
    currentPlan.value = snap.currentPlan
      ? { ...snap.currentPlan, waypoints: cloneWaypoints(snap.currentPlan.waypoints) }
      : null;
    simProgress.value = snap.simProgress;
    selectedAlgorithm.value = snap.selectedAlgorithm;
  }

  function updatePlan() {
    const stats = calculateFlightStats(waypoints.value, droneConfig.value);
    currentPlan.value = {
      id: `plan-${Date.now()}`,
      name: 'Flight Plan',
      waypoints: [...waypoints.value],
      totalDistance: stats.totalDistance,
      estimatedTime: stats.estimatedTime,
      batteryUsage: stats.batteryUsage,
    };
  }

  let simInterval: ReturnType<typeof setInterval> | null = null;

  function simulateFlight() {
    if (waypoints.value.length < 2 || isSimulating.value) return;
    isSimulating.value = true;
    simProgress.value = 0;
    simInterval = setInterval(() => {
      simProgress.value += 1;
      if (simProgress.value >= 100) {
        simProgress.value = 100;
        isSimulating.value = false;
        if (simInterval) clearInterval(simInterval);
      }
    }, 50);
  }

  function loadMockData() {
    noFlyZones.value = mockNoFlyZones;
    terrainData.value = mockTerrainData;
  }

  function exportPlan(): string {
    if (!currentPlan.value) return '';
    return exportKML(currentPlan.value);
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const hasSnapshot = computed(() => routeSnapshot.value !== null);

  const snapshotTime = computed(() =>
    routeSnapshot.value ? routeSnapshot.value.timestamp : 0
  );

  const totalDistance = computed(() => {
    if (!currentPlan.value) return 0;
    return currentPlan.value.totalDistance;
  });

  const estimatedTime = computed(() => {
    if (!currentPlan.value) return 0;
    return currentPlan.value.estimatedTime;
  });

  const batteryPercent = computed(() => {
    if (!currentPlan.value) return 0;
    return currentPlan.value.batteryUsage;
  });

  const terrainProfile = computed(() => {
    if (waypoints.value.length < 2) return [];
    return waypoints.value.map((wp) => {
      let nearestElev = 0;
      let minDist = Infinity;
      for (const tp of terrainData.value) {
        const d =
          (tp.lat - wp.lat) ** 2 + (tp.lng - wp.lng) ** 2;
        if (d < minDist) {
          minDist = d;
          nearestElev = tp.elevation;
        }
      }
      return {
        lat: wp.lat,
        lng: wp.lng,
        altitude: wp.altitude,
        terrainElevation: nearestElev,
      };
    });
  });

  return {
    waypoints,
    noFlyZones,
    terrainData,
    currentPlan,
    droneConfig,
    selectedAlgorithm,
    isSimulating,
    simProgress,
    mapCenter,
    routeSnapshot,
    hasSnapshot,
    snapshotTime,
    totalDistance,
    estimatedTime,
    batteryPercent,
    terrainProfile,
    addWaypoint,
    removeWaypoint,
    updateWaypoint,
    planRoute,
    clearRoute,
    restoreRoute,
    simulateFlight,
    loadMockData,
    exportPlan,
    updatePlan,
  };
});
