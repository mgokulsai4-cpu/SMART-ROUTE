export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface FleetBounds {
  center: GeoPoint;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  sizeKm: number;
}

export interface RoadRoute {
  points: GeoPoint[];
  distanceKm: number;
  durationMin: number;
  steps: RoadRouteStep[];
}

export interface RoadRouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  name: string | null;
  maneuverType: string;
  modifier: string | null;
}

export interface SeededRng {
  seed: number;
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
}

const EARTH_RADIUS_M = 6371000;

export function createSeededRng(seed: number): SeededRng {
  let state = (seed >>> 0) || 0x6d2b79f5;

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    next,
    range(min: number, max: number) {
      return min + (max - min) * next();
    },
    int(min: number, max: number) {
      return Math.floor(this.range(min, max + 1));
    },
  };
}

export function createBounds(center: GeoPoint, sizeKm: number): FleetBounds {
  const halfKm = sizeKm / 2;
  const latDelta = halfKm / 111.32;
  const lngDelta = halfKm / (111.32 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));

  return {
    center,
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
    sizeKm,
  };
}

export function randomPointInBounds(rng: SeededRng, bounds: FleetBounds): GeoPoint {
  return {
    lat: rng.range(bounds.minLat, bounds.maxLat),
    lng: rng.range(bounds.minLng, bounds.maxLng),
  };
}

export function randomPointInRadius(rng: SeededRng, center: GeoPoint, radiusKm: number): GeoPoint {
  const angle = rng.range(0, Math.PI * 2);
  const distanceKm = Math.sqrt(rng.next()) * radiusKm;
  const latScale = 1 / 111.32;
  const lngScale = 1 / (111.32 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));

  return {
    lat: center.lat + Math.cos(angle) * distanceKm * latScale,
    lng: center.lng + Math.sin(angle) * distanceKm * lngScale,
  };
}

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function isPointWithinRadius(point: GeoPoint, center: GeoPoint, radiusMeters: number): boolean {
  return haversineMeters(point, center) <= radiusMeters;
}

export function isRouteWithinRadius(route: GeoPoint[], center: GeoPoint, radiusMeters: number): boolean {
  if (!route.length) return false;
  return route.every((point) => isPointWithinRadius(point, center, radiusMeters));
}

function formatModifier(modifier?: string | null): string {
  switch (modifier) {
    case 'left':
    case 'right':
    case 'slight left':
    case 'slight right':
    case 'sharp left':
    case 'sharp right':
    case 'straight':
      return modifier;
    default:
      return 'straight';
  }
}

function describeOsrmStep(step: {
  name: string;
  maneuver: { type?: string; modifier?: string | null; exit?: number | null };
}): string {
  const roadName = step.name?.trim();
  const roadPart = roadName ? ` onto ${roadName}` : '';
  const modifier = formatModifier(step.maneuver.modifier);

  switch (step.maneuver.type) {
    case 'depart':
      return roadName ? `Head ${modifier}${roadPart}` : 'Start driving';
    case 'turn':
      return roadName ? `Turn ${modifier}${roadPart}` : `Turn ${modifier}`;
    case 'new name':
      return roadName ? `Continue on ${roadName}` : 'Continue straight';
    case 'merge':
      return roadName ? `Merge onto ${roadName}` : 'Merge with traffic';
    case 'fork':
      return roadName ? `Keep ${modifier}${roadPart}` : `Keep ${modifier}`;
    case 'roundabout':
      return step.maneuver.exit ? `At the roundabout, take exit ${step.maneuver.exit}${roadPart}` : 'Enter the roundabout';
    case 'rotary':
      return step.maneuver.exit ? `At the rotary, take exit ${step.maneuver.exit}${roadPart}` : 'Enter the rotary';
    case 'off ramp':
      return roadName ? `Take the exit toward ${roadName}` : 'Take the exit';
    case 'on ramp':
      return roadName ? `Take the ramp onto ${roadName}` : 'Take the ramp';
    case 'arrive':
      return 'Arrive at destination';
    default:
      return roadName ? `Continue on ${roadName}` : 'Continue straight';
  }
}

function buildFallbackSteps(routeNodes: GeoPoint[], cruiseSpeedKmh: number): RoadRouteStep[] {
  if (routeNodes.length < 2) {
    return [
      {
        instruction: 'Arrive at destination',
        distanceMeters: 0,
        durationSeconds: 0,
        name: null,
        maneuverType: 'arrive',
        modifier: null,
      },
    ];
  }

  const steps: RoadRouteStep[] = [];
  for (let i = 0; i < routeNodes.length - 1; i += 1) {
    const from = routeNodes[i];
    const to = routeNodes[i + 1];
    const distanceMeters = Math.max(1, haversineMeters(from, to));
    steps.push({
      instruction: i === 0 ? 'Head toward the stop' : 'Continue toward the stop',
      distanceMeters,
      durationSeconds: (distanceMeters / 1000 / cruiseSpeedKmh) * 3600,
      name: null,
      maneuverType: i === 0 ? 'depart' : 'continue',
      modifier: null,
    });
  }

  steps.push({
    instruction: 'Arrive at destination',
    distanceMeters: 0,
    durationSeconds: 0,
    name: null,
    maneuverType: 'arrive',
    modifier: null,
  });

  return steps;
}

function buildSimpleRouteSteps(distanceMeters: number, durationSeconds: number): RoadRouteStep[] {
  return [
    {
      instruction: 'Continue to the destination',
      distanceMeters: Math.max(1, distanceMeters),
      durationSeconds: Math.max(1, durationSeconds),
      name: null,
      maneuverType: 'continue',
      modifier: null,
    },
    {
      instruction: 'Arrive at destination',
      distanceMeters: 0,
      durationSeconds: 0,
      name: null,
      maneuverType: 'arrive',
      modifier: null,
    },
  ];
}

export function buildRadiusRing(center: GeoPoint, radiusKm: number, segments: number = 160): GeoPoint[] {
  const latScale = radiusKm / 111.32;
  const lngScale = radiusKm / (111.32 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const points: GeoPoint[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      lat: center.lat + Math.cos(angle) * latScale,
      lng: center.lng + Math.sin(angle) * lngScale,
    });
  }

  return points;
}

export function buildFallbackRoadRoute(
  start: GeoPoint,
  end: GeoPoint,
  center: GeoPoint,
  radiusKm: number,
  rng: SeededRng,
): RoadRoute {
  const radiusMeters = radiusKm * 1000;
  const turnA = { lat: start.lat, lng: end.lng };
  const turnB = { lat: end.lat, lng: start.lng };

  const turnCandidates = [turnA, turnB].filter((point) => isPointWithinRadius(point, center, radiusMeters));

  const routeNodes: GeoPoint[] = [start];

  if (turnCandidates.length > 0) {
    routeNodes.push(turnCandidates[rng.int(0, turnCandidates.length - 1)]);
  } else {
    routeNodes.push(interpolatePoint(start, end, 0.5));
  }

  if (haversineMeters(start, end) > 2200 && rng.next() > 0.5) {
    const pivot = routeNodes[1];
    const extraTurn = interpolatePoint(pivot, end, 0.45);
    if (isPointWithinRadius(extraTurn, center, radiusMeters)) {
      routeNodes.push(extraTurn);
    }
  }

  routeNodes.push(end);

  const densePoints: GeoPoint[] = [];
  for (let i = 0; i < routeNodes.length - 1; i += 1) {
    const from = routeNodes[i];
    const to = routeNodes[i + 1];
    const segmentMeters = Math.max(1, haversineMeters(from, to));
    const steps = Math.max(1, Math.ceil(segmentMeters / 180));

    for (let step = 0; step < steps; step += 1) {
      densePoints.push(interpolatePoint(from, to, step / steps));
    }
  }

  densePoints.push(routeNodes[routeNodes.length - 1]);

  let totalMeters = 0;
  for (let i = 0; i < densePoints.length - 1; i += 1) {
    totalMeters += haversineMeters(densePoints[i], densePoints[i + 1]);
  }

  const cruiseSpeedKmh = rng.range(28, 36);
  const steps = buildFallbackSteps(routeNodes, cruiseSpeedKmh);

  return {
    points: densePoints,
    distanceKm: totalMeters / 1000,
    durationMin: ((totalMeters / 1000) / cruiseSpeedKmh) * 60,
    steps,
  };
}

export function interpolatePoint(a: GeoPoint, b: GeoPoint, ratio: number): GeoPoint {
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lng: a.lng + (b.lng - a.lng) * ratio,
  };
}

export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function remainingRouteDistanceMeters(route: GeoPoint[], routeIndex: number, segmentProgressM: number): number {
  if (route.length < 2 || routeIndex >= route.length - 1) return 0;

  let distance = 0;
  for (let i = routeIndex; i < route.length - 1; i += 1) {
    distance += haversineMeters(route[i], route[i + 1]);
  }

  const currentSegment = haversineMeters(route[routeIndex], route[routeIndex + 1]);
  return Math.max(0, distance - Math.min(segmentProgressM, currentSegment));
}

type OsrmResponse = {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
    legs?: Array<{
      steps?: Array<{
        distance: number;
        duration: number;
        name: string;
        maneuver: {
          type?: string;
          modifier?: string | null;
          exit?: number | null;
        };
      }>;
    }>;
  }>;
};

export async function fetchRoadRoute(
  start: GeoPoint,
  end: GeoPoint,
  signal?: AbortSignal,
  timeoutMs: number = 9000,
): Promise<RoadRoute | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng.toFixed(6)},${start.lat.toFixed(6)};${end.lng.toFixed(6)},${end.lat.toFixed(6)}?overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const syncAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', syncAbort, { once: true });
    }
  }

  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;

    const data = (await response.json()) as OsrmResponse;
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) return null;

    const points = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    if (points.length < 2) return null;

    const osrmSteps = route.legs?.[0]?.steps ?? [];
    const steps = osrmSteps.map((step) => ({
      instruction: describeOsrmStep(step),
      distanceMeters: Math.max(1, step.distance),
      durationSeconds: Math.max(1, step.duration),
      name: step.name?.trim() ? step.name : null,
      maneuverType: step.maneuver?.type || 'continue',
      modifier: step.maneuver?.modifier || null,
    }));

    return {
      points,
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      steps: steps.length > 0 ? steps : buildSimpleRouteSteps(route.distance, route.duration),
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', syncAbort);
    }
  }
}
