import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { createPartnerIcon, createStopNumberIcon } from '../../utils/mapIcons';
import TopBar from '../../components/TopBar';
import { usePolling } from '../../hooks/usePolling';
import { orderService } from '../../services/orderService';
import { deliveryService } from '../../services/deliveryService';
import { routingService } from '../../services/routingService';
import { useSocket } from '../../contexts/SocketContext';
import { HelmetMonitorStatus, Order, RouteStop } from '../../types';
import { DELIVERY_ACTIVE_STATUSES, statusLabel } from '../../utils/status';
import { extractErrorMessage } from '../../utils/errors';
import { detectHelmetInVideo } from '../../utils/helmetDetection';
import { useTranslation } from 'react-i18next';
import {
  GeoPoint,
  fetchRoadRoute,
  buildFallbackRoadRoute,
  haversineMeters,
  RoadRouteStep,
} from '../../utils/fleetSimulation';
import { DELIVERY_ZONE_CENTER, DELIVERY_ZONE_RADIUS_KM } from '../../utils/deliveryZone';

const AREA_CENTER: GeoPoint = DELIVERY_ZONE_CENTER;
const HELMET_CHECK_INTERVAL_MS = 1000;
const ARRIVAL_RADIUS_METERS = 45;
const LIVE_SYNC_INTERVAL_MS = 1800;
const OFF_ROUTE_THRESHOLD_METERS = 120;
const REROUTE_COOLDOWN_MS = 12000;
const SPEED_LIMIT_KMH = 60;

function findNearestPointMatch(
  points: GeoPoint[],
  target: GeoPoint,
  start: number,
  end: number,
): { index: number; distanceMeters: number } {
  if (!points.length) {
    return { index: 0, distanceMeters: Number.POSITIVE_INFINITY };
  }

  const from = Math.max(0, Math.min(start, points.length - 1));
  const to = Math.max(from, Math.min(end, points.length - 1));

  let bestIndex = from;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = from; i <= to; i += 1) {
    const candidate = points[i];
    const distance = haversineMeters(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return { index: bestIndex, distanceMeters: bestDistance };
}

function FollowPartnerPosition({
  point,
  follow,
}: {
  point: GeoPoint | null;
  follow: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!point || !follow) return;
    map.panTo([point.lat, point.lng], {
      animate: true,
      duration: 0.45,
    });
  }, [follow, map, point]);

  return null;
}

function MapInstanceBridge({
  onMapReady,
}: {
  onMapReady: (map: LeafletMap) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  return null;
}

function createTempRng() {
  return {
    next: () => Math.random(),
    range: (a: number, b: number) => a + Math.random() * (b - a),
    int: (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1)),
    seed: Date.now(),
  };
}

function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
}

function directionGlyph(step: RoadRouteStep): string {
  if (step.maneuverType === 'arrive') return '🏁';
  if (step.maneuverType === 'roundabout' || step.maneuverType === 'rotary') return '↻';
  if ((step.modifier || '').includes('left')) return '↰';
  if ((step.modifier || '').includes('right')) return '↱';
  if (step.maneuverType === 'merge' || step.maneuverType === 'on ramp' || step.maneuverType === 'off ramp') return '➚';
  return '↑';
}

async function buildPolylineFromStops(startPoint: GeoPoint, stops: RouteStop[]): Promise<{
  points: GeoPoint[];
  legDistancesMeters: number[];
  legPointRanges: Array<{ start: number; end: number } | null>;
  legSteps: RoadRouteStep[][];
}> {
  if (!stops.length) {
    return {
      points: [],
      legDistancesMeters: [],
      legPointRanges: [],
      legSteps: [],
    };
  }

  const mergedPoints: GeoPoint[] = [startPoint];
  const legDistancesMeters: number[] = [];
  const legPointRanges: Array<{ start: number; end: number } | null> = [];
  const legSteps: RoadRouteStep[][] = [];
  let currentPoint = startPoint;

  for (const stop of stops) {
    if (stop.lat == null || stop.lng == null) {
      legDistancesMeters.push(1);
      legPointRanges.push(null);
      legSteps.push([]);
      continue;
    }

    const stopPoint: GeoPoint = { lat: stop.lat, lng: stop.lng };
    const leg = await fetchRoadRoute(currentPoint, stopPoint);
    const routeToUse = leg ?? buildFallbackRoadRoute(
      currentPoint,
      stopPoint,
      AREA_CENTER,
      DELIVERY_ZONE_RADIUS_KM,
      createTempRng(),
    );
    const legPoints = routeToUse.points;

    const startIndex = Math.max(0, mergedPoints.length - 1);
    if (legPoints.length > 1) {
      mergedPoints.push(...legPoints.slice(1));
    }
    const endIndex = Math.max(startIndex, mergedPoints.length - 1);

    let distanceMeters = 0;
    for (let idx = 0; idx < legPoints.length - 1; idx++) {
      const a = legPoints[idx];
      const b = legPoints[idx + 1];
      if (a && b) {
        distanceMeters += haversineMeters(a, b);
      }
    }

    legDistancesMeters.push(Math.max(1, distanceMeters));
    legPointRanges.push({ start: startIndex, end: endIndex });
    legSteps.push(routeToUse.steps);
    currentPoint = stopPoint;
  }

  return {
    points: mergedPoints,
    legDistancesMeters,
    legPointRanges,
    legSteps,
  };
}

export default function Navigation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { emitLocationUpdate, isConnected, orderUpdate, addNotification } = useSocket();

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerPoint, setPartnerPoint] = useState<GeoPoint | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeMeta, setRouteMeta] = useState<{ totalDistance: number; eta: number; algorithm: string } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [statusLoadingOrderId, setStatusLoadingOrderId] = useState<number | null>(null);

  const [travelSpeed, setTravelSpeed] = useState(30);
  const [isTravelling, setIsTravelling] = useState(false);
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  const [arrivedAtStop, setArrivedAtStop] = useState<'restaurant' | 'customer' | null>(null);
  const [travelPoints, setTravelPoints] = useState<GeoPoint[]>([]);
  const [legPointRangesByStop, setLegPointRangesByStop] = useState<Array<{ start: number; end: number } | null>>([]);
  const [legDirectionsByStop, setLegDirectionsByStop] = useState<RoadRouteStep[][]>([]);
  const [loadingTravel, setLoadingTravel] = useState(false);
  const [helmetDetected, setHelmetDetected] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [helmetWarningCount, setHelmetWarningCount] = useState(0);
  const [helmetWarningLimit, setHelmetWarningLimit] = useState(5);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [helmetMessage, setHelmetMessage] = useState('Helmet monitoring active.');
  const [destinationReached, setDestinationReached] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const activeOrdersRef = useRef<Order[]>([]);
  const partnerPointRef = useRef<GeoPoint | null>(null);

  const legProgressRef = useRef(0);
  const geoWatchRef = useRef<number | null>(null);
  const currentLegIndexRef = useRef(0);
  const routeStopsRef = useRef<RouteStop[]>([]);
  const legPointRangesRef = useRef<Array<{ start: number; end: number } | null>>([]);
  const travelPointsRef = useRef<GeoPoint[]>([]);
  const lastLocationSyncAtRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const rerouteInFlightRef = useRef(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const helmetVideoRef = useRef<HTMLVideoElement | null>(null);
  const helmetStreamRef = useRef<MediaStream | null>(null);
  const helmetDetectTimerRef = useRef<number | null>(null);
  const helmetDetectBusyRef = useRef(false);
  const isTravellingRef = useRef(false);
  const arrivedAtStopRef = useRef<'restaurant' | 'customer' | null>(null);
  const currentPositionRef = useRef<GeoPoint | null>(null);
  const lastHelmetToastAtRef = useRef(0);

  const canNavigate = helmetDetected && cameraActive && !navigationLocked;
  const isSpeeding = isTravelling && travelSpeed > SPEED_LIMIT_KMH;

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
    setIsMapReady(true);
  }, []);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  useEffect(() => {
    isTravellingRef.current = isTravelling;
  }, [isTravelling]);

  useEffect(() => {
    arrivedAtStopRef.current = arrivedAtStop;
  }, [arrivedAtStop]);

  useEffect(() => {
    if (!partnerPoint) return;
    currentPositionRef.current = partnerPoint;
  }, [partnerPoint]);

  useEffect(() => {
    currentLegIndexRef.current = currentLegIndex;
  }, [currentLegIndex]);

  useEffect(() => {
    routeStopsRef.current = routeStops;
  }, [routeStops]);

  useEffect(() => {
    legPointRangesRef.current = legPointRangesByStop;
  }, [legPointRangesByStop]);

  useEffect(() => {
    travelPointsRef.current = travelPoints;
  }, [travelPoints]);

  useEffect(() => {
    partnerPointRef.current = partnerPoint;
  }, [partnerPoint]);

  const activeOrders = useMemo(
    () => orders.filter((o) => DELIVERY_ACTIVE_STATUSES.includes(o.status)),
    [orders],
  );

  useEffect(() => {
    activeOrdersRef.current = activeOrders;
  }, [activeOrders]);

  usePolling(
    () => orderService.list(),
    6000,
    (data) => setOrders(data),
  );

  useEffect(() => {
    if (!orderUpdate) return;
    setOrders((prev) =>
      prev
        .map((o) =>
          o.id === orderUpdate.order_id
            ? { ...o, status: orderUpdate.status as Order['status'], partner_id: orderUpdate.partner_id ?? o.partner_id }
            : o
        )
        .filter((o) => o.status !== 'cancelled')
    );
  }, [orderUpdate]);

  useEffect(() => {
    setStatusLoadingOrderId((current) => {
      if (!current) return current;
      return activeOrders.some((order) => order.id === current) ? current : null;
    });
  }, [activeOrders]);

  usePolling(
    () => deliveryService.me(),
    15000,
    (partner) => {
      setPartnerId(partner.id);
      if (partner.current_lat != null && partner.current_lng != null) {
        setPartnerPoint({ lat: partner.current_lat, lng: partner.current_lng });
      }
      setHelmetDetected(Boolean(partner.helmet_detected));
      setCameraActive(Boolean(partner.camera_active));
      setHelmetWarningCount(partner.helmet_warning_count ?? 0);
      setNavigationLocked(Boolean(partner.navigation_locked));
      if (partner.navigation_locked) {
        setHelmetMessage('Navigation is locked. Wear helmet to continue.');
      }
    },
  );

  useEffect(() => {
    if (activeOrders.length === 0) {
      setSelectedOrderIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const queryOrder = Number(searchParams.get('order'));
    const validQueryOrder =
      queryOrder && activeOrders.some((o) => o.id === queryOrder) ? [queryOrder] : [];

    setSelectedOrderIds((prev) => {
      const validPrevious = prev.filter((id) => activeOrders.some((o) => o.id === id)).slice(0, 4);
      const nextSelection =
        validPrevious.length > 0
          ? validPrevious
          : validQueryOrder.length > 0
            ? validQueryOrder
            : activeOrders.slice(0, Math.min(4, activeOrders.length)).map((o) => o.id);

      if (prev.length === nextSelection.length && prev.every((id, index) => id === nextSelection[index])) {
        return prev;
      }

      return nextSelection;
    });
  }, [activeOrders, searchParams]);

  const currentOrder = useMemo<Order | null>(() => {
    const id = Number(searchParams.get('order'));
    if (id) return orders.find((o) => o.id === id) || null;
    return activeOrders[0] || null;
  }, [orders, activeOrders, searchParams]);

  const activeRouteStop = useMemo<RouteStop | null>(() => {
    if (!routeStops.length) return null;
    return routeStops[currentLegIndex] || null;
  }, [routeStops, currentLegIndex]);

  const activeRouteOrder = useMemo<Order | null>(() => {
    if (activeRouteStop) {
      return activeOrders.find((o) => o.id === activeRouteStop.order_id) || null;
    }
    return currentOrder;
  }, [activeOrders, activeRouteStop, currentOrder]);

  const selectedRouteSignature = useMemo(
    () =>
      selectedOrderIds
        .map((id) => {
          const order = activeOrders.find((o) => o.id === id);
          if (!order) return `${id}:missing`;
          return [
            order.id,
            order.status,
            order.priority,
            order.priority_reason ?? '',
            order.restaurant_lat ?? '',
            order.restaurant_lng ?? '',
            order.customer_lat ?? '',
            order.customer_lng ?? '',
            order.customer_address ?? '',
          ].join(':');
        })
        .join('|'),
    [activeOrders, selectedOrderIds],
  );

  const stopTravel = useCallback((fromSafety: boolean = false) => {
    if (geoWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }

    const lastPoint = currentPositionRef.current;
    if (lastPoint) {
      setPartnerPoint(lastPoint);
    }

    setIsTravelling(false);
    isTravellingRef.current = false;
    legProgressRef.current = 0;
    setArrivedAtStop(null);
    arrivedAtStopRef.current = null;
    setDestinationReached(false);
    setCurrentLegIndex(0);
    currentLegIndexRef.current = 0;

    if (fromSafety) {
      addNotification({
        icon: '⛔',
        title: 'Navigation Stopped',
        body: 'Helmet not detected. Wear helmet to continue delivery.',
      });
    }
  }, [addNotification]);

  const applyHelmetMonitorStatus = useCallback((status: HelmetMonitorStatus) => {
    setHelmetDetected(status.helmet_detected);
    setCameraActive(status.camera_active);
    setHelmetWarningCount(status.warning_count);
    setHelmetWarningLimit(status.warning_limit);
    setNavigationLocked(status.navigation_locked);
    setHelmetMessage(status.message);

    if (status.should_stop_navigation && isTravellingRef.current) {
      stopTravel(true);
    }
  }, [stopTravel]);

  const requestLivePosition = useCallback(async (): Promise<{ point: GeoPoint; speedKmh: number } | null> => {
    if (!navigator.geolocation) {
      return null;
    }

    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }).catch(() => null);

    if (!coords) {
      return null;
    }

    const point = { lat: coords.latitude, lng: coords.longitude };
    const speedKmh = Math.max(0, (coords.speed || 0) * 3.6);
    currentPositionRef.current = point;
    setPartnerPoint(point);
    return { point, speedKmh };
  }, []);

  const cleanupHelmetMonitoring = useCallback(() => {
    if (helmetDetectTimerRef.current) {
      window.clearInterval(helmetDetectTimerRef.current);
      helmetDetectTimerRef.current = null;
    }
    if (helmetStreamRef.current) {
      helmetStreamRef.current.getTracks().forEach((track) => track.stop());
      helmetStreamRef.current = null;
    }
    if (helmetVideoRef.current) {
      helmetVideoRef.current.srcObject = null;
    }
    helmetDetectBusyRef.current = false;
  }, []);

  const monitorHelmetOnce = useCallback(async () => {
    if (helmetDetectBusyRef.current) return;
    helmetDetectBusyRef.current = true;

    try {
      let detected = true;
      let cameraOk = true;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !helmetVideoRef.current) {
        detected = false;
        cameraOk = false;
      } else {
        if (!helmetStreamRef.current) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
              audio: false,
            });
            helmetStreamRef.current = stream;
            helmetVideoRef.current.srcObject = stream;
            await helmetVideoRef.current.play();
          } catch {
            detected = false;
            cameraOk = false;
          }
        }

        if (cameraOk && helmetVideoRef.current) {
          const result = await detectHelmetInVideo(helmetVideoRef.current);
          if (result.topLabel === 'waiting_for_camera') {
            return;
          }
          detected = result.helmetDetected;
        }
      }

      let point = currentPositionRef.current;
      if (!point) {
        const live = await requestLivePosition();
        point = live?.point ?? null;
      }

      const status = await deliveryService.reportHelmetMonitor({
        helmet_detected: detected,
        camera_active: cameraOk,
        is_navigating: isTravellingRef.current,
        lat: point?.lat,
        lng: point?.lng,
      });

      applyHelmetMonitorStatus(status);
    } catch {
      const now = Date.now();
      if (now - lastHelmetToastAtRef.current > 8000) {
        addNotification({
          icon: '⚠️',
          title: 'Helmet Monitor Error',
          body: 'Could not verify helmet status. Check camera permissions.',
        });
        lastHelmetToastAtRef.current = now;
      }
    } finally {
      helmetDetectBusyRef.current = false;
    }
  }, [addNotification, applyHelmetMonitorStatus, requestLivePosition]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void monitorHelmetOnce();
    }, 0);

    helmetDetectTimerRef.current = window.setInterval(() => {
      void monitorHelmetOnce();
    }, HELMET_CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(initTimer);
      cleanupHelmetMonitoring();
    };
  }, [cleanupHelmetMonitoring, monitorHelmetOnce]);

  useEffect(() => {
    if (!canNavigate && isTravelling) {
      stopTravel(true);
    }
  }, [canNavigate, isTravelling, stopTravel]);

  useEffect(() => {
    if (arrivedAtStop) {
      setDestinationReached(false);
    }
  }, [arrivedAtStop]);

  const syncCurrentLocation = useCallback(async () => {
    const live = await requestLivePosition();
    if (!live) {
      setRouteError('Location permission is unavailable in this browser.');
      return null;
    }

    await deliveryService.updateLocation(live.point.lat, live.point.lng, live.speedKmh);
    if (partnerId) {
      emitLocationUpdate({ partner_id: partnerId, lat: live.point.lat, lng: live.point.lng, speed_kmh: live.speedKmh });
    }

    return live.point;
  }, [emitLocationUpdate, partnerId, requestLivePosition]);

  const buildRoute = useCallback(async () => {
    if (!selectedOrderIds.length) {
      setRouteError('Select at least one order to optimize route.');
      return;
    }

    setLoadingRoute(true);
    setRouteError('');

    try {
      let point = await syncCurrentLocation();
      if (!point) point = partnerPointRef.current;
      if (!point) return;

      const currentActiveOrders = activeOrdersRef.current;

      const route = await routingService.optimizeRoute(selectedOrderIds);

      const withCoords = await Promise.all(
        route.stops.map(async (stop) => {
          if (stop.lat != null && stop.lng != null) return stop;

          if (stop.stop_type === 'pickup') return stop;

          const ord = currentActiveOrders.find((o) => o.id === stop.order_id);
          if (!ord?.customer_address) return stop;

          try {
            const result = await routingService.geocodeAddress(ord.customer_address);
            if (!result) return stop;
            return { ...stop, lat: result.lat, lng: result.lng };
          } catch {
            return stop;
          }
        }),
      );

      setRouteStops(withCoords);

      const polyline = await buildPolylineFromStops(point, withCoords);
      const roadDistanceKm = polyline.legDistancesMeters.reduce((sum, meters) => sum + meters, 0) / 1000;

      setRouteMeta({
        totalDistance: roadDistanceKm > 0 ? roadDistanceKm : route.total_distance_km,
        eta: route.estimated_minutes,
        algorithm: route.algorithm,
      });
      setTravelPoints(polyline.points);
      setLegPointRangesByStop(polyline.legPointRanges);
      setLegDirectionsByStop(polyline.legSteps);

      setCurrentLegIndex(0);
      currentLegIndexRef.current = 0;
      legProgressRef.current = 0;
      setArrivedAtStop(null);
      arrivedAtStopRef.current = null;
    } catch (err) {
      setRouteError(extractErrorMessage(err, 'Failed to optimize route.'));
      setRouteStops([]);
      setRouteMeta(null);
      setTravelPoints([]);
      setLegPointRangesByStop([]);
      setLegDirectionsByStop([]);
    } finally {
      setLoadingRoute(false);
    }
  }, [selectedOrderIds, syncCurrentLocation]);

  useEffect(() => {
    if (selectedOrderIds.length === 0) {
      setRouteStops([]);
      setRouteMeta(null);
      setTravelPoints([]);
      setLegPointRangesByStop([]);
      setLegDirectionsByStop([]);
      setCurrentLegIndex(0);
      currentLegIndexRef.current = 0;
      legProgressRef.current = 0;
      setArrivedAtStop(null);
      arrivedAtStopRef.current = null;
      return;
    }

    void buildRoute();
  }, [buildRoute, selectedRouteSignature, selectedOrderIds.length]);

  const startTravel = useCallback(async () => {
    if (!canNavigate) {
      addNotification({
        icon: '⛑️',
        title: 'Helmet Required',
        body: helmetMessage,
      });
      return;
    }

    setLoadingTravel(true);
    const live = await syncCurrentLocation();
    const startPoint = live ?? partnerPointRef.current;
    if (!startPoint) {
      setLoadingTravel(false);
      return;
    }

    const polyline = await buildPolylineFromStops(startPoint, routeStopsRef.current);
    const points = polyline.points;
    const ranges = polyline.legPointRanges;

    setTravelPoints(points);
    setLegPointRangesByStop(ranges);
    setLegDirectionsByStop(polyline.legSteps);
    setLoadingTravel(false);

    if (!points.length || !ranges.length) return;

    setIsTravelling(true);
    isTravellingRef.current = true;
    setCurrentLegIndex(0);
    currentLegIndexRef.current = 0;
    legProgressRef.current = 0;
    setArrivedAtStop(null);
    arrivedAtStopRef.current = null;
    setDestinationReached(false);
    currentPositionRef.current = startPoint;
    setPartnerPoint(startPoint);
    lastLocationSyncAtRef.current = Date.now();

    const syncPosition = async (point: GeoPoint, speedKmh: number) => {
      if (!partnerId) return;
      const now = Date.now();
      if (now - lastLocationSyncAtRef.current < LIVE_SYNC_INTERVAL_MS) return;
      lastLocationSyncAtRef.current = now;
      emitLocationUpdate({ partner_id: partnerId, lat: point.lat, lng: point.lng, speed_kmh: speedKmh });
      await deliveryService.updateLocation(point.lat, point.lng, speedKmh);
    };

    const applyGpsUpdate = async (point: GeoPoint, speedKmhRaw: number) => {
      if (!isTravellingRef.current) return;
      if (arrivedAtStopRef.current) return;

      const speedKmh = Math.max(0, speedKmhRaw || travelSpeed);
      const currentLeg = currentLegIndexRef.current;
      const legRange = legPointRangesRef.current[currentLeg];
      const activeStop = routeStopsRef.current[currentLeg];

      if (!legRange || !activeStop || activeStop.lat == null || activeStop.lng == null) return;

      const nearest = findNearestPointMatch(travelPointsRef.current, point, legRange.start, legRange.end);
      const nearestIndex = nearest.index;
      const segmentLen = Math.max(1, legRange.end - legRange.start);
      const localProgress = Math.max(0, Math.min(1, (nearestIndex - legRange.start) / segmentLen));

      legProgressRef.current = localProgress;
      currentPositionRef.current = point;
      setPartnerPoint(point);

      const now = Date.now();
      const canReroute =
        nearest.distanceMeters > OFF_ROUTE_THRESHOLD_METERS
        && !rerouteInFlightRef.current
        && now - lastRerouteAtRef.current >= REROUTE_COOLDOWN_MS;

      if (canReroute) {
        rerouteInFlightRef.current = true;
        lastRerouteAtRef.current = now;
        try {
          const updatedPolyline = await buildPolylineFromStops(point, routeStopsRef.current);
          if (updatedPolyline.points.length && updatedPolyline.legPointRanges.length) {
            setTravelPoints(updatedPolyline.points);
            setLegPointRangesByStop(updatedPolyline.legPointRanges);
            setLegDirectionsByStop(updatedPolyline.legSteps);
            legProgressRef.current = 0;

            addNotification({
              icon: '🧭',
              title: 'Route Updated',
              body: 'You moved off route. Navigation has been recalculated.',
            });
          }
        } finally {
          rerouteInFlightRef.current = false;
        }
      }

      await syncPosition(point, speedKmh);

      const stopPoint = { lat: activeStop.lat, lng: activeStop.lng };
      const remainingMeters = haversineMeters(point, stopPoint);
      if (remainingMeters > ARRIVAL_RADIUS_METERS) return;

      if (activeStop.stop_type === 'pickup') {
        setArrivedAtStop('restaurant');
        arrivedAtStopRef.current = 'restaurant';
        legProgressRef.current = 1;
        return;
      }

      setArrivedAtStop('customer');
      arrivedAtStopRef.current = 'customer';
      legProgressRef.current = 1;
    };

    if (!navigator.geolocation) {
      addNotification({
        icon: '📍',
        title: 'GPS Not Available',
        body: 'Live GPS is not available in this browser.',
      });
      stopTravel();
      return;
    }

    if (geoWatchRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }

    geoWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const speedKmh = Math.max(0, (position.coords.speed || 0) * 3.6);
        void applyGpsUpdate(point, speedKmh);
      },
      () => {
        addNotification({
          icon: '⚠️',
          title: 'GPS Error',
          body: 'Could not read live location. Check GPS permission.',
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      },
    );
  }, [addNotification, canNavigate, emitLocationUpdate, helmetMessage, partnerId, stopTravel, syncCurrentLocation, travelSpeed]);

  useEffect(() => {
    return () => {
      if (geoWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = null;
      }
    };
  }, []);

  const travellingMarkerPos = useMemo<GeoPoint | null>(() => {
    if (!isTravelling || !travelPoints.length) return partnerPoint;
    if (arrivedAtStop) return partnerPoint;

    const range = legPointRangesByStop[currentLegIndex];
    if (!range) return partnerPoint;

    const segLen = Math.max(1, range.end - range.start);
    const localProgress = legProgressRef.current;
    const targetIdx = Math.min(range.start + Math.round(localProgress * segLen), range.end, travelPoints.length - 1);

    return travelPoints[targetIdx] || partnerPoint;
  }, [isTravelling, travelPoints, partnerPoint, currentLegIndex, arrivedAtStop, legPointRangesByStop]);

  const routeLine = useMemo<[number, number][]>(() => {
    if (!travelPoints.length || !partnerPoint) return [];
    if (arrivedAtStop) return [[partnerPoint.lat, partnerPoint.lng]];

    if (isTravelling && legPointRangesByStop[currentLegIndex]) {
      const range = legPointRangesByStop[currentLegIndex];
      if (range) {
        const segLen = Math.max(1, range.end - range.start);
        const localProgress = legProgressRef.current;
        const targetIdx = Math.min(range.start + Math.round(localProgress * segLen), range.end, travelPoints.length - 1);

        const pos = travelPoints[targetIdx] || partnerPoint;
        return [
          [pos.lat, pos.lng] as [number, number],
          ...travelPoints.slice(targetIdx).map((p) => [p.lat, p.lng] as [number, number]),
        ];
      }
    }

    return [
      [partnerPoint.lat, partnerPoint.lng],
      ...travelPoints.map((p) => [p.lat, p.lng] as [number, number]),
    ];
  }, [travelPoints, partnerPoint, arrivedAtStop, isTravelling, currentLegIndex, legPointRangesByStop]);

  const activeDirections = useMemo(() => {
    if (!legDirectionsByStop.length) return [];
    return legDirectionsByStop[currentLegIndex] || [];
  }, [currentLegIndex, legDirectionsByStop]);

  const nextDirections = useMemo(() => {
    return activeDirections
      .filter((step) => step.distanceMeters > 0 || step.maneuverType === 'arrive')
      .slice(0, 5);
  }, [activeDirections]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    const point = travellingMarkerPos ?? partnerPoint ?? currentPositionRef.current;
    if (!map || !point) return;

    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.45,
    });
  }, [partnerPoint, travellingMarkerPos]);

  const toggleOrder = (orderId: number) => {
    if (isTravelling) return;
    setSelectedOrderIds((prev) => {
      if (prev.includes(orderId)) return prev.filter((id) => id !== orderId);
      if (prev.length >= 4) return prev;
      return [...prev, orderId];
    });
  };

  const runStatusAction = async (order: Order) => {
    if (!canNavigate && order.status !== 'ready') {
      addNotification({
        icon: '⛑️',
        title: 'Helmet Required',
        body: helmetMessage,
      });
      return;
    }

    setStatusLoadingOrderId(order.id);
    try {
      if (order.status === 'picked_up') {
        await orderService.updateStatus(order.id, 'in_transit');
      } else if (order.status === 'in_transit') {
        await orderService.updateStatus(order.id, 'delivered');
        stopTravel();
      } else if (order.status === 'ready') {
        navigate(`/delivery/qr?order=${order.id}`);
        return;
      }
      const mine = await orderService.list();
      setOrders(mine);
    } finally {
      setStatusLoadingOrderId(null);
    }
  };

  const handleTakeOrder = async () => {
    const targetOrder = activeRouteOrder;
    if (!targetOrder) return;
    if (!canNavigate) {
      addNotification({
        icon: '⛑️',
        title: 'Helmet Required',
        body: helmetMessage,
      });
      return;
    }

    setDestinationReached(false);
    setArrivedAtStop(null);
    arrivedAtStopRef.current = null;
    legProgressRef.current = 0;
    const nextLeg = currentLegIndexRef.current + 1;
    if (nextLeg < routeStopsRef.current.length) {
      setCurrentLegIndex(nextLeg);
      currentLegIndexRef.current = nextLeg;
    } else {
      stopTravel();
    }
    await orderService.updateStatus(targetOrder.id, 'picked_up');
    const mine = await orderService.list();
    setOrders(mine);
  };

  const handleMarkDelivered = async () => {
    const targetOrder = activeRouteOrder;
    if (!targetOrder) return;
    if (!canNavigate) {
      addNotification({
        icon: '⛑️',
        title: 'Helmet Required',
        body: helmetMessage,
      });
      return;
    }

    setArrivedAtStop(null);
    arrivedAtStopRef.current = null;
    legProgressRef.current = 0;
    await orderService.updateStatus(targetOrder.id, 'delivered');
    const mine = await orderService.list();
    setOrders(mine);

    const nextLeg = currentLegIndexRef.current + 1;
    if (nextLeg < routeStopsRef.current.length) {
      setCurrentLegIndex(nextLeg);
      currentLegIndexRef.current = nextLeg;
    } else {
      stopTravel();
    }
  };

  const actionLabel = (status: Order['status']) => {
    if (status === 'ready') return t('scan_qr');
    if (status === 'picked_up') return 'Mark in transit';
    if (status === 'in_transit') return t('delivered_to_customer');
    return 'Waiting for update';
  };

  const actionEnabled = (status: Order['status']) => ['ready', 'picked_up', 'in_transit'].includes(status);
  const arrivalTitle = arrivedAtStop === 'customer'
    ? 'Reached Destination'
    : activeRouteStop
      ? `Reached Stop ${activeRouteStop.sequence}`
      : 'Reached Stop';
  const arrivalCompleteLabel = activeRouteStop?.stop_type === 'pickup'
    ? 'Successfully Picked Up'
    : 'Successfully Delivered';

  const handleArrivalComplete = async () => {
    if (activeRouteStop?.stop_type === 'pickup') {
      await handleTakeOrder();
      return;
    }

    await handleMarkDelivered();
  };

  return (
    <>
      {/* Full-screen map */}
      <div className="map-container nav-fullscreen">
        <MapContainer
          center={partnerPoint ? [partnerPoint.lat, partnerPoint.lng] : [AREA_CENTER.lat, AREA_CENTER.lng]}
          zoom={13}
          className="map-real"
          zoomControl={false}
          touchZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapInstanceBridge onMapReady={handleMapReady} />
          <FollowPartnerPosition point={travellingMarkerPos ?? partnerPoint} follow={isTravelling} />

          {partnerPoint && !isTravelling && (
            <Marker
              position={[partnerPoint.lat, partnerPoint.lng]}
              icon={createPartnerIcon('online')}
            >
              <Popup>You are here</Popup>
            </Marker>
          )}

          {travellingMarkerPos && isTravelling && (
            <Marker
              position={[travellingMarkerPos.lat, travellingMarkerPos.lng]}
              icon={createPartnerIcon('busy')}
            >
              <Popup>🛵 Traveling at {travelSpeed} km/h</Popup>
            </Marker>
          )}

          {routeStops.map((stop) =>
            stop.lat != null && stop.lng != null ? (
              <Marker
                key={stop.order_id}
                position={[stop.lat, stop.lng]}
                icon={createStopNumberIcon(stop.sequence, stop.stop_type)}
              >
                <Popup>
                  #{stop.sequence} · #{stop.order_number} - {stop.food_name}
                </Popup>
              </Marker>
            ) : null,
          )}

          {routeLine.length >= 2 && (
            <Polyline
              positions={routeLine}
              pathOptions={{ color: isTravelling ? '#3b82f6' : '#22c55e', weight: 3 }}
            />
          )}
        </MapContainer>
      </div>

      {/* TopBar overlay */}
      <div className="nav-overlay nav-overlay-topbar">
        <TopBar
          title={t('nav_navigation')}
          subtitle={`${selectedOrderIds.length} stop${selectedOrderIds.length === 1 ? '' : 's'} · max 4 · click map to select`}
        >
          <button
            className="btn btn-ghost map-zoom"
            onClick={handleZoomOut}
            disabled={!isMapReady}
            title="Zoom out"
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            className="btn btn-ghost map-zoom"
            onClick={handleZoomIn}
            disabled={!isMapReady}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 10, padding: '6px 10px' }}
            onClick={handleRecenter}
            disabled={!partnerPoint && !travellingMarkerPos}
          >
            🎯 Recenter
          </button>
          <div className={`status-pill ${isConnected ? 'online' : 'warning'}`}>
            <div className="dot" /> {isConnected ? t('connected') : t('reconnecting')}
          </div>
          <div className={`status-pill ${canNavigate ? 'online' : 'warning'}`}>
            <div className="dot" />
            {canNavigate ? 'Helmet OK' : 'Helmet Required'}
          </div>
        </TopBar>
      </div>

      {/* Route Builder - bottom left */}
      <div className="nav-overlay nav-overlay-left">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>ROUTE BUILDER · UP TO 4 ORDERS</div>
          {activeOrders.length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>No active orders assigned.</div>
          ) : (
            activeOrders.map((order) => {
              const checked = selectedOrderIds.includes(order.id);
              const disabled = !checked && selectedOrderIds.length >= 4;
              const pickupPending = ['confirmed', 'preparing', 'ready'].includes(order.status);
              return (
                <label
                  key={order.id}
                  className={`turn-item ${checked ? 'active' : 'normal'}`}
                  style={{ cursor: disabled || isTravelling ? 'not-allowed' : 'pointer', opacity: disabled || isTravelling ? 0.5 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || isTravelling}
                    onChange={() => toggleOrder(order.id)}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      #{order.order_number} · {order.items?.[0]?.food_item_name || 'Order'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                      {pickupPending ? 'Pickup pending' : 'Delivering'} · {statusLabel(order.status)}
                    </div>
                  </div>
                </label>
              );
            })
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => void syncCurrentLocation()} disabled={isTravelling}>
              📍 Sync
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '6px 10px', flex: 1 }}
              onClick={() => void buildRoute()}
              disabled={loadingRoute || selectedOrderIds.length === 0 || isTravelling || !canNavigate}
            >
              {loadingRoute ? 'Optimizing...' : '🗺️ Optimize Route'}
            </button>
          </div>
          {routeError && <div style={{ color: 'var(--red)', fontSize: 11 }}>{routeError}</div>}
        </div>
      </div>

      {/* Delivery Sequence - top right */}
      <div className="nav-overlay nav-overlay-right-top">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>DELIVERY SEQUENCE · {routeMeta?.algorithm || 'NO ROUTE'}</div>
          {routeStops.length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>Optimize route to view stops.</div>
          ) : (
            routeStops.map((stop) => {
              const order = activeOrders.find((o) => o.id === stop.order_id);
              return (
                <div
                  key={stop.order_id}
                  className={`route-step ${stop.priority === 1 ? 'priority-1' : stop.priority === 2 ? 'priority-2' : 'priority-3'}`}
                >
                  <div className={`route-num ${stop.sequence === 1 ? 'n1' : stop.sequence === 2 ? 'n2' : stop.sequence === 3 ? 'n3' : 'n4'}`}>
                    {stop.sequence}
                  </div>
                  <div className="route-food-emoji">{stop.stop_type === 'pickup' ? '🏪' : stop.food_emoji}</div>
                  <div className="route-info">
                    <div className="route-customer">#{stop.order_number} · {stop.food_name}</div>
                    <div className="route-reason">
                      {stop.stop_type === 'pickup'
                        ? `Pickup · ${stop.distance_km} km`
                        : stop.priority_reason || `${stop.distance_km} km`}
                    </div>
                    {order && (
                      <button
                        className="btn btn-ghost"
                        style={{ marginTop: 6, padding: '4px 8px', fontSize: 10 }}
                        disabled={!actionEnabled(order.status) || statusLoadingOrderId === order.id}
                        onClick={() => void runStatusAction(order)}
                      >
                        {statusLoadingOrderId === order.id ? '...' : actionLabel(order.status)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Route Stats - bottom right */}
      <div className="nav-overlay nav-overlay-right-bottom">
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 170px)', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>TURN BY TURN</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>
            {activeRouteStop
              ? `To #${activeRouteStop.order_number} · ${activeRouteStop.stop_type === 'pickup' ? 'Pickup' : 'Dropoff'}`
              : 'Optimize route to see directions.'}
          </div>
          {nextDirections.length === 0 ? (
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>No directions available.</div>
          ) : (
            nextDirections.map((step, index) => (
              <div
                key={`${step.instruction}-${index}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  background: index === 0 ? 'rgba(59,130,246,0.12)' : 'var(--bg3)',
                  border: index === 0 ? '1px solid rgba(59,130,246,0.35)' : '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ width: 22, textAlign: 'center', fontSize: 16, lineHeight: '18px', marginTop: 1 }}>
                  {directionGlyph(step)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, lineHeight: '16px' }}>{step.instruction}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {formatDistanceMeters(step.distanceMeters)}{step.name ? ` · ${step.name}` : ''}
                  </div>
                </div>
              </div>
            ))
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>ROUTE STATS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Distance</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
              {routeMeta ? `${routeMeta.totalDistance.toFixed(1)} km` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Best route</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#22c55e' }}>
              {routeMeta ? routeMeta.algorithm : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Duration</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{routeMeta ? `${routeMeta.eta} min` : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Speed / Limit</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: isSpeeding ? 'var(--red)' : isTravelling ? '#3b82f6' : 'var(--text3)' }}>
              {isTravelling ? `${travelSpeed} / ${SPEED_LIMIT_KMH} km/h` : `— / ${SPEED_LIMIT_KMH} km/h`}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Stops</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{routeStops.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Helmet</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: canNavigate ? 'var(--green)' : 'var(--red)' }}>
              {helmetDetected ? 'DETECTED' : 'NOT DETECTED'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Warnings</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: helmetWarningCount >= helmetWarningLimit ? 'var(--red)' : 'var(--amber)' }}>
              {helmetWarningCount}/{helmetWarningLimit}
            </span>
          </div>
          <div style={{ fontSize: 11, color: canNavigate ? 'var(--text3)' : 'var(--red)' }}>
            {helmetMessage}
          </div>
        </div>
      </div>

      {/* Bottom bar: speed + start/stop */}
      <div className="nav-overlay nav-overlay-bottombar">
        <div className="travel-speed-control">
          <label>Speed <strong>{travelSpeed} km/h</strong> <span style={{ color: isSpeeding ? 'var(--red)' : 'var(--text3)', fontSize: 11, fontFamily: 'var(--font-mono)', marginLeft: 8 }}>LIMIT {SPEED_LIMIT_KMH} km/h</span></label>
          <input
            type="range"
            min="10"
            max="80"
            value={travelSpeed}
            onChange={(e) => setTravelSpeed(Number(e.target.value))}
            disabled={isTravelling}
          />
        </div>
        <div className="travel-actions">
          {!isTravelling ? (
            <button
              className="btn btn-primary"
              onClick={() => void startTravel()}
              disabled={loadingTravel || !routeStops.length || !canNavigate}
            >
              {loadingTravel ? t('loading') : t('start_delivery')}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => stopTravel()}>
              {t('stop')}
            </button>
          )}
        </div>
      </div>

      {/* Arrival banner - centered over map */}
      {arrivedAtStop && activeRouteOrder && (
        <div className="nav-arrival">
          <div className="nav-arrival-icon">
            {arrivedAtStop === 'restaurant' ? '🏪' : '🏠'}
          </div>
          <div className="nav-arrival-text">
            <strong>{arrivalTitle}</strong>
            <span>
              {activeRouteOrder.items?.[0]?.food_item_name || `Order #${activeRouteOrder.order_number}`}
              {activeRouteStop ? ` · Stop ${activeRouteStop.sequence}` : ''}
            </span>
          </div>
          <div className="nav-arrival-buttons">
            {!destinationReached ? (
              <button className="btn btn-primary" onClick={() => setDestinationReached(true)}>
                Reached Destination
              </button>
            ) : (
              <button className="btn btn-green" onClick={() => void handleArrivalComplete()}>
                {arrivalCompleteLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <video ref={helmetVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
    </>
  );
}
