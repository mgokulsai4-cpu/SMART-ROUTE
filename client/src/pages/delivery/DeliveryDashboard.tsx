import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '../../components/TopBar';
import StatCard from '../../components/StatCard';
import DeliveryLocationPicker from '../../components/DeliveryLocationPicker';
import { orderService } from '../../services/orderService';
import { Order } from '../../types';
import { useNavigate } from 'react-router-dom';
import { usePolling } from '../../hooks/usePolling';
import { deliveryService } from '../../services/deliveryService';
import { useSocket } from '../../contexts/SocketContext';
import { DELIVERY_ACTIVE_STATUSES, statusLabel } from '../../utils/status';
import { FAR_PICKUP_DISTANCE_KM, randomPointInDeliveryZone } from '../../utils/deliveryZone';
import { haversineMeters } from '../../utils/fleetSimulation';
import { useTranslation } from 'react-i18next';

type GPoint = { lat: number; lng: number };

const PICKUP_PENDING_STATUSES: Order['status'][] = ['confirmed', 'preparing', 'ready'];
const MAX_ASSIGNED_ORDERS = 4;
const PARTNER_LOCATION_STORAGE_KEY = 'partnerLocation';

function parseStoredPoint(raw: string | null): GPoint | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    return null;
  }
  return null;
}

function getLocationStorageKey() {
  try {
    const rawUser = sessionStorage.getItem('user');
    if (!rawUser) return PARTNER_LOCATION_STORAGE_KEY;
    const parsedUser = JSON.parse(rawUser) as { user_id?: unknown };
    if (typeof parsedUser.user_id === 'number') {
      return `${PARTNER_LOCATION_STORAGE_KEY}:${parsedUser.user_id}`;
    }
  } catch {
    return PARTNER_LOCATION_STORAGE_KEY;
  }
  return PARTNER_LOCATION_STORAGE_KEY;
}

function getStoredPartnerLocation(): GPoint | null {
  const scoped = parseStoredPoint(localStorage.getItem(getLocationStorageKey()));
  if (scoped) return scoped;
  return parseStoredPoint(localStorage.getItem(PARTNER_LOCATION_STORAGE_KEY));
}

function setStoredPartnerLocation(point: GPoint) {
  const encoded = JSON.stringify(point);
  localStorage.setItem(getLocationStorageKey(), encoded);
  localStorage.setItem(PARTNER_LOCATION_STORAGE_KEY, encoded);
}

function isPickupPending(status: Order['status']) {
  return PICKUP_PENDING_STATUSES.includes(status);
}

export default function DeliveryDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [partnerPoint, setPartnerPoint] = useState<GPoint | null>(() => getStoredPartnerLocation());
  const [locationSet, setLocationSet] = useState<boolean>(() => getStoredPartnerLocation() !== null);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [acceptedOrders, setAcceptedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [locatingCurrent, setLocatingCurrent] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const { newOrderRequest, clearNewOrderRequest, addNotification, isConnected } = useSocket();
  const seedingLocationRef = useRef(false);

  const getCurrentGeoPoint = useCallback(
    () => new Promise<GPoint | null>((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }),
    [],
  );

  const syncCurrentLocation = useCallback(async () => {
    if (locatingCurrent) return;
    setLocatingCurrent(true);

    try {
      const point = await getCurrentGeoPoint();
      if (!point) {
        addNotification({
          icon: '⚠️',
          title: 'Location unavailable',
          body: 'Allow location access to use your current GPS position.',
        });
        return;
      }

      await deliveryService.updateLocation(point.lat, point.lng, 0);
      setPartnerPoint(point);
      setStoredPartnerLocation(point);
      setLocationSet(true);
      setShowLocationPicker(false);
      addNotification({
        icon: '📍',
        title: 'Location updated',
        body: `Current location set to ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}.`,
      });
    } catch {
      addNotification({
        icon: '⚠️',
        title: 'Location sync failed',
        body: 'Could not update current location. Try again.',
      });
    } finally {
      setLocatingCurrent(false);
    }
  }, [addNotification, getCurrentGeoPoint, locatingCurrent]);

  usePolling(
    () => deliveryService.me(),
    15000,
    (partner) => {
      if (partner.current_lat != null && partner.current_lng != null) {
        const currentPoint = { lat: partner.current_lat, lng: partner.current_lng };
        setPartnerPoint(currentPoint);
        if (!locationSet) setLocationSet(true);
        setStoredPartnerLocation(currentPoint);
        return;
      }

      if (seedingLocationRef.current) return;

      const cachedPoint = getStoredPartnerLocation();
      if (cachedPoint) {
        setPartnerPoint(cachedPoint);
        if (!locationSet) setLocationSet(true);

        seedingLocationRef.current = true;
        void deliveryService.updateLocation(cachedPoint.lat, cachedPoint.lng, 0)
          .catch(() => null)
          .finally(() => { seedingLocationRef.current = false; });
        return;
      }

      if (locationSet) return;

      seedingLocationRef.current = true;

      const seedFromCurrentLocation = async () => {
        const browserPoint = await getCurrentGeoPoint();
        return browserPoint ?? randomPointInDeliveryZone();
      };

      void seedFromCurrentLocation()
        .then((fallback) => deliveryService.updateLocation(fallback.lat, fallback.lng, 0).then(() => fallback))
        .then((fallback) => {
          setPartnerPoint(fallback);
          setLocationSet(true);
          setStoredPartnerLocation(fallback);
        })
        .catch(() => null)
        .finally(() => { seedingLocationRef.current = false; });
    },
  );

  usePolling(
    async () => {
      const [avail, mine] = await Promise.all([
        orderService.getAvailable(),
        orderService.list(),
      ]);
      return { avail, mine };
    },
    5000,
    ({ avail, mine }) => {
      setAvailableOrders(avail);
      setAcceptedOrders(mine.filter((o) => DELIVERY_ACTIVE_STATUSES.includes(o.status)));
      setLoading(false);
      setLastSync(new Date());
    },
    () => setLoading(false),
  );

  useEffect(() => {
    if (!locationSet) {
      setShowLocationPicker(true);
    }
  }, [locationSet]);

  useEffect(() => {
    if (newOrderRequest) {
      setAvailableOrders((prev) => {
        if (prev.some((o) => o.id === newOrderRequest.id)) return prev;
        return [newOrderRequest, ...prev];
      });
    }
  }, [newOrderRequest]);

  const handleLocationSet = useCallback(async (point: GPoint) => {
    try {
      await deliveryService.updateLocation(point.lat, point.lng, 0);
    } catch { /* ignore */ }
    setPartnerPoint(point);
    setStoredPartnerLocation(point);
    setLocationSet(true);
    setShowLocationPicker(false);
  }, []);

  const getPickupDistanceKm = useCallback((order: Order) => {
    if (!partnerPoint || order.restaurant_lat == null || order.restaurant_lng == null) return null;
    return haversineMeters(partnerPoint, {
      lat: order.restaurant_lat,
      lng: order.restaurant_lng,
    }) / 1000;
  }, [partnerPoint]);

  const nearestOpenOrders = useMemo(
    () => [...availableOrders]
      .filter((o) => !acceptedOrders.some((a) => a.id === o.id))
      .sort((a, b) => {
        const aDist = getPickupDistanceKm(a);
        const bDist = getPickupDistanceKm(b);
        const aVal = aDist == null ? Number.POSITIVE_INFINITY : aDist;
        const bVal = bDist == null ? Number.POSITIVE_INFINITY : bDist;
        if (aVal !== bVal) return aVal - bVal;
        return a.id - b.id;
      }),
    [availableOrders, acceptedOrders, getPickupDistanceKm],
  );

  const nearestRankByOrderId = useMemo(
    () => nearestOpenOrders.reduce<Record<number, number>>((acc, order, index) => {
      acc[order.id] = index + 1;
      return acc;
    }, {}),
    [nearestOpenOrders],
  );

  const handleAccept = useCallback(async (orderId: number) => {
    if (acceptedOrders.length >= MAX_ASSIGNED_ORDERS) {
      addNotification({ icon: '⚠️', title: 'Limit reached', body: `You can accept up to ${MAX_ASSIGNED_ORDERS} active orders.` });
      return;
    }
    if (!locationSet) {
      setShowLocationPicker(true);
      return;
    }

    const nearestByDistance = nearestOpenOrders.find((o) => getPickupDistanceKm(o) != null);
    const targetOrderId = nearestByDistance?.id ?? orderId;

    setAccepting(targetOrderId);
    try {
      await orderService.accept(targetOrderId);
      const mine = await orderService.list();
      setAcceptedOrders(mine.filter((o) => DELIVERY_ACTIVE_STATUSES.includes(o.status)));
      setAvailableOrders((prev) => prev.filter((o) => o.id !== targetOrderId));
      clearNewOrderRequest();
      const accepted = nearestOpenOrders.find((o) => o.id === targetOrderId);
      addNotification({
        icon: '✅',
        title: 'Order accepted',
        body: accepted ? `Assigned nearest order #${accepted.order_number}.` : 'Assigned nearest order.',
      });
    } catch (e: unknown) {
      if ((e as { response?: { status?: number } })?.response?.status === 409) {
        const avail = await orderService.getAvailable();
        setAvailableOrders(avail);
        addNotification({ icon: 'ℹ️', title: 'Already taken', body: 'This order was accepted by another partner.' });
      }
    } finally {
      setAccepting(null);
    }
  }, [acceptedOrders, locationSet, addNotification, clearNewOrderRequest, nearestOpenOrders, getPickupDistanceKm]);

  const totalRemainingKm = useMemo(
    () => acceptedOrders.reduce((sum, o) => sum + o.distance_km, 0).toFixed(1),
    [acceptedOrders],
  );

  const totalEtaMinutes = useMemo(
    () => acceptedOrders.reduce((sum, o) => sum + o.eta_minutes, 0),
    [acceptedOrders],
  );

  const priorityLabel = (order: Order) => {
    if (order.priority === 1) return { text: '🧊 DELIVER FIRST', cls: 'priority-high' };
    if (order.priority === 2) return { text: '🔥 MEDIUM', cls: 'priority-med' };
    return { text: 'NORMAL', cls: 'priority-low' };
  };

  return (
    <>
      <TopBar title={t('delivery_dash')} subtitle={`${availableOrders.length} open · ${acceptedOrders.length} assigned`}>
        <div className={`status-pill ${isConnected ? 'online' : 'warning'}`}>
          <div className="dot" /> {isConnected ? t('connected') : t('reconnecting')}
        </div>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '6px 10px' }}
          onClick={() => void syncCurrentLocation()}
          disabled={locatingCurrent}
        >
          {locatingCurrent ? '📡 Locating...' : '📍 Use Current Location'}
        </button>
      </TopBar>

      {showLocationPicker && (
        <DeliveryLocationPicker onLocationSet={handleLocationSet} />
      )}

      {newOrderRequest && (
        <div className="incoming-order-modal-overlay">
          <div className="incoming-order-modal">
            <div className="incoming-order-header">
              <span className="incoming-order-icon">🔔</span>
              <span>New Delivery Request</span>
            </div>
            <div className="incoming-order-body">
              <div className="incoming-order-num">Order #{newOrderRequest.order_number}</div>
              <div className="incoming-order-items">
                {(newOrderRequest.items || []).slice(0, 2).map((item) => (
                  <span key={item.id}>{item.food_item_name || 'Item'}{item.quantity > 1 ? ` x${item.quantity}` : ''}</span>
                ))}
                {(newOrderRequest.items || []).length > 2 && <span>+{(newOrderRequest.items || []).length - 2} more</span>}
              </div>
              <div className="incoming-order-details">
                <div>Total: <strong>₹{newOrderRequest.total_amount}</strong></div>
                <div>Delivery: <strong>{newOrderRequest.distance_km} km</strong></div>
                <div>You earn: <strong>₹{newOrderRequest.delivery_fee}</strong></div>
              </div>
              {newOrderRequest.priority === 1 && (
                <div className="incoming-order-priority">🧊 PRIORITY — Deliver First</div>
              )}
            </div>
            <div className="incoming-order-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  clearNewOrderRequest();
                  setAvailableOrders((prev) => prev.filter((o) => o.id !== newOrderRequest.id));
                }}
              >
                Dismiss
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleAccept(newOrderRequest.id)}
                disabled={accepting !== null || acceptedOrders.length >= MAX_ASSIGNED_ORDERS}
              >
                {accepting !== null ? 'Accepting...' : '✓ Accept Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="content">
        <div className="stats-grid">
          <StatCard icon="📦" value={availableOrders.length} label={t('available_orders')} color="amber" />
          <StatCard icon="🛵" value={acceptedOrders.length} label={t('assigned_orders')} color="green" />
          <StatCard icon="🧭" value={totalRemainingKm} label={t('remaining_km')} color="blue" />
          <StatCard icon="⏱" value={totalEtaMinutes} label={t('total_eta')} color="red" />
        </div>

        {acceptedOrders.length > 0 && (
          <>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                {t('my_active_orders')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                Last sync: {lastSync ? lastSync.toLocaleTimeString() : '—'}
              </div>
            </div>
            <div className="orders-grid">
              {acceptedOrders.map((order) => {
                const pickupPending = isPickupPending(order.status);
                const destinationLabel = order.customer_address || 'Customer address unlocks after pickup QR';

                return (
                  <div key={order.id} className="order-card selected">
                    <div className="order-num">ORDER #{order.order_number}</div>
                    <div className="order-name">{order.items?.[0]?.food_item_name || `Order #${order.order_number}`}</div>
                    <div className="order-meta">{pickupPending ? 'Next stop: Restaurant pickup' : 'Next stop: Customer drop'}</div>
                    <div className="order-meta">{destinationLabel}</div>
                    <div className="order-footer">
                      <div className="order-distance">{order.distance_km} km</div>
                      <div className="order-eta">Status: <span style={{ color: 'var(--green)' }}>{statusLabel(order.status)}</span></div>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                      onClick={() => navigate(`/delivery/nav?order=${order.id}`)}
                    >
                      {t('open_navigation')}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{ marginBottom: 16, marginTop: acceptedOrders.length > 0 ? 24 : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {t('available_orders')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {partnerPoint
              ? `${partnerPoint.lat.toFixed(4)}, ${partnerPoint.lng.toFixed(4)}`
              : 'Initializing location...'}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading orders...</div>
        ) : availableOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div>No available orders right now. New orders will appear automatically.</div>
          </div>
        ) : (
          <div className="orders-grid">
            {availableOrders.map((order) => {
              const p = priorityLabel(order);
              const nearestRank = nearestRankByOrderId[order.id];
              const isAccepting = accepting === order.id;
              const pickupDistanceKm = getPickupDistanceKm(order);
              const isFarPickup = pickupDistanceKm != null && pickupDistanceKm > FAR_PICKUP_DISTANCE_KM;
              const pickupPointLabel =
                order.restaurant_lat != null && order.restaurant_lng != null
                  ? `${order.restaurant_lat.toFixed(4)}, ${order.restaurant_lng.toFixed(4)}`
                  : 'Restaurant location unavailable';

              return (
                <div key={order.id} className="order-card">
                  <div className="order-num">ORDER #{order.order_number}</div>
                  <div className="order-name">{order.items?.[0]?.food_item_name || `Order #${order.order_number}`}</div>
                  <div className="order-meta">Pickup point: {pickupPointLabel}</div>
                  <div className="order-meta">
                    {pickupDistanceKm == null
                      ? 'Distance available after location sync'
                      : `${pickupDistanceKm.toFixed(1)} km from your location`}
                  </div>
                  {isFarPickup && (
                    <div style={{ marginTop: 8 }}>
                      <span className="chip danger">FAR ({pickupDistanceKm.toFixed(1)} km)</span>
                    </div>
                  )}
                  <div className={`order-priority ${p.cls}`}>{p.text}</div>
                  {nearestRank && pickupDistanceKm != null && (
                    <div style={{ marginTop: 8 }}>
                      <span className="chip" style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399', borderColor: 'rgba(16,185,129,0.45)' }}>
                        Nearest #{nearestRank}
                      </span>
                    </div>
                  )}
                  <div className="order-footer">
                    <div className="order-distance">{order.distance_km} km delivery</div>
                    <div className="order-eta">Pickup first · ₹{order.delivery_fee}</div>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: 12, justifyContent: 'center', opacity: isAccepting ? 0.6 : 1 }}
                    disabled={accepting !== null || acceptedOrders.length >= MAX_ASSIGNED_ORDERS}
                    onClick={(e) => { e.stopPropagation(); handleAccept(order.id); }}
                  >
                    {isAccepting ? t('loading') : t('accept_order')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
