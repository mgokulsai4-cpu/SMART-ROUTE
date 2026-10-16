import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import Timeline from '../../components/Timeline';
import Chip from '../../components/Chip';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { createRestaurantIcon, createCustomerIcon, createPartnerIcon } from '../../utils/mapIcons';
import { orderService } from '../../services/orderService';
import { usePolling } from '../../hooks/usePolling';
import { useSocket } from '../../contexts/SocketContext';
import { Order } from '../../types';
import {
  ACTIVE_ORDER_STATUSES,
  CUSTOMER_SIMPLE_STEPS,
  customerSimpleStageIndex,
  statusLabel,
  toCustomerSimpleStage,
} from '../../utils/status';
import { useTranslation } from 'react-i18next';

function statusChip(status: Order['status']) {
  switch (status) {
    case 'delivered':
      return <Chip type="delivered">Delivered</Chip>;
    case 'picked_up':
    case 'in_transit':
      return <Chip type="transit">Picked Up</Chip>;
    case 'pending':
      return <Chip type="pending">Order Placed</Chip>;
    case 'confirmed':
    case 'preparing':
    case 'ready':
      return <Chip type="pending">Restaurant Accepted</Chip>;
    default:
      return <Chip type="pending">{statusLabel(status)}</Chip>;
  }
}

function customerStageLabel(status: Order['status']) {
  const stage = toCustomerSimpleStage(status);
  return CUSTOMER_SIMPLE_STEPS.find((step) => step.key === stage)?.label || statusLabel(status);
}

export default function TrackOrder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { orderUpdate, partnerLocation, joinTracking } = useSocket();

  usePolling(
    () => orderService.list(),
    6000,
    (data) => setOrders(data.filter((o) => o.status !== 'cancelled')),
  );

  useEffect(() => {
    if (!orderUpdate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)),
    [orders],
  );

  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === 'delivered'),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    if (activeOrders.length > 0) {
      return [...activeOrders, ...deliveredOrders.slice(0, 3)];
    }
    return deliveredOrders.slice(0, 6);
  }, [activeOrders, deliveredOrders]);

  const selectedOrder =
    visibleOrders.find((o) => o.id === selectedOrderId) || visibleOrders[0] || null;

  useEffect(() => {
    for (const order of activeOrders) {
      joinTracking(order.id);
    }
  }, [activeOrders, joinTracking]);

  const subtitle = useMemo(() => {
    if (activeOrders.length > 0) {
      return `${activeOrders.length} active order${activeOrders.length === 1 ? '' : 's'}`;
    }
    if (visibleOrders.length > 0) {
      return `${visibleOrders.length} recent delivered order${visibleOrders.length === 1 ? '' : 's'}`;
    }
    return t('no_active_order');
  }, [activeOrders.length, visibleOrders.length, t]);

  const stageIndex = selectedOrder ? customerSimpleStageIndex(selectedOrder.status) : -1;
  const stageLabel = selectedOrder
    ? CUSTOMER_SIMPLE_STEPS[stageIndex]?.label || 'Order in progress'
    : '';
  const progressPct = selectedOrder
    ? Math.max(0, Math.round((stageIndex / (CUSTOMER_SIMPLE_STEPS.length - 1)) * 100))
    : 0;

  const selectedOrderIsActive = selectedOrder
    ? ACTIVE_ORDER_STATUSES.includes(selectedOrder.status)
    : false;

  const livePartnerPoint = useMemo(() => {
    if (!selectedOrder || !selectedOrderIsActive || !partnerLocation) return null;
    if (partnerLocation.order_id && partnerLocation.order_id !== selectedOrder.id) return null;
    if (selectedOrder.partner_id && partnerLocation.partner_id !== selectedOrder.partner_id) return null;
    return { lat: partnerLocation.lat, lng: partnerLocation.lng };
  }, [selectedOrder, selectedOrderIsActive, partnerLocation]);

  const customerMapCenter = useMemo<[number, number]>(() => {
    if (livePartnerPoint) {
      return [livePartnerPoint.lat, livePartnerPoint.lng];
    }

    if (selectedOrder?.customer_lat != null && selectedOrder?.customer_lng != null) {
      return [selectedOrder.customer_lat, selectedOrder.customer_lng];
    }

    if (selectedOrder?.restaurant_lat != null && selectedOrder?.restaurant_lng != null) {
      return [selectedOrder.restaurant_lat, selectedOrder.restaurant_lng];
    }

    return [18.1086, 83.4020];
  }, [livePartnerPoint, selectedOrder]);

  const timelineItems = useMemo(() => {
    if (!selectedOrder) return [];

    const stage = toCustomerSimpleStage(selectedOrder.status);

    return CUSTOMER_SIMPLE_STEPS.map((step, index) => {
      const itemStatus = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'pending';
      return {
        icon: itemStatus === 'done' ? '✓' : itemStatus === 'active' ? '•' : '○',
        title: step.label,
        time: index === stageIndex ? `Current: ${step.label}` : index < stageIndex ? 'Completed' : 'Pending',
        status: itemStatus,
        titleColor: step.key === stage ? 'var(--amber)' : undefined,
      } as const;
    });
  }, [selectedOrder, stageIndex]);

  return (
    <>
      <TopBar
        title={t('track_title')}
        subtitle={subtitle}
      >
        <button className="btn btn-ghost" onClick={() => navigate('/customer/order')}>
          {t('order_more')}
        </button>
      </TopBar>

      <div className="content customer-track-page">
        {!selectedOrder ? (
          <section className="customer-track-empty">
            <div className="customer-track-empty-icon">🛵</div>
            <h2>No order in progress</h2>
            <p>Place an order and you will see accepted, picked-up, and delivered updates here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/customer/order')}>
              Order Food
            </button>
          </section>
        ) : (
          <>
            <section className="customer-track-orders">
              <div className="customer-track-orders-head">
                <h3>Your Orders</h3>
                <span>
                  {activeOrders.length > 0
                    ? `${activeOrders.length} active`
                    : `${visibleOrders.length} delivered`}
                </span>
              </div>
              <div className="customer-track-orders-grid">
                {visibleOrders.map((order) => {
                  const isSelected = order.id === selectedOrder.id;
                  const firstItem = order.items?.[0]?.food_item_name || 'Order';
                  const extraItems = Math.max(0, (order.items?.length || 0) - 1);

                  return (
                    <button
                      key={order.id}
                      type="button"
                      className={`customer-track-order-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <div className="customer-track-order-top">
                        <span className="customer-track-order-number">Order #{order.order_number}</span>
                        {statusChip(order.status)}
                      </div>
                      <div className="customer-track-order-title">
                        {firstItem}
                        {extraItems > 0 ? ` +${extraItems} more` : ''}
                      </div>
                      <div className="customer-track-order-meta">
                        {customerStageLabel(order.status)} · ETA {order.eta_minutes} min
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="customer-track-hero">
              <div>
                <div className="customer-track-hero-kicker">Live order progress</div>
                <div className="customer-track-hero-title">
                  {selectedOrder.items?.[0]?.food_item_name || 'Your order is being prepared'}
                </div>
                <div className="customer-track-hero-meta">
                  {stageLabel} · ETA {selectedOrder.eta_minutes} min
                </div>
              </div>
              <div className="customer-track-hero-right">
                {statusChip(selectedOrder.status)}
                <div className="customer-track-eta">{selectedOrder.eta_minutes}m</div>
              </div>
              <div className="customer-track-progress">
                <div className="customer-track-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </section>

            {selectedOrderIsActive && (
              <section className="customer-track-map-section">
                <div className="customer-track-map-header">
                  <span>🛵 {t('live_driver_loc')}</span>
                  {livePartnerPoint ? (
                    <span className="live-dot" />
                  ) : selectedOrder.partner_id ? (
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>Waiting for live location...</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>Partner not assigned yet.</span>
                  )}
                </div>
                <div className="map-container" style={{ height: 200, borderRadius: 12, overflow: 'hidden' }}>
                  <MapContainer
                    center={customerMapCenter}
                    zoom={14}
                    className="map-real"
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {selectedOrder.restaurant_lat && selectedOrder.restaurant_lng && (
                      <Marker
                        position={[selectedOrder.restaurant_lat, selectedOrder.restaurant_lng]}
                        icon={createRestaurantIcon()}
                      >
                        <Popup>Restaurant</Popup>
                      </Marker>
                    )}
                    {selectedOrder.customer_lat && selectedOrder.customer_lng && (
                      <Marker
                        position={[selectedOrder.customer_lat, selectedOrder.customer_lng]}
                        icon={createCustomerIcon()}
                      >
                        <Popup>Your Location</Popup>
                      </Marker>
                    )}
                    {livePartnerPoint && (
                      <Marker
                        position={[livePartnerPoint.lat, livePartnerPoint.lng]}
                        icon={createPartnerIcon('busy')}
                      >
                        <Popup>Delivery Partner</Popup>
                      </Marker>
                    )}
                    {livePartnerPoint && selectedOrder.restaurant_lat && selectedOrder.restaurant_lng && (
                      <Polyline
                        positions={[
                          [livePartnerPoint.lat, livePartnerPoint.lng],
                          [selectedOrder.customer_lat ?? livePartnerPoint.lat, selectedOrder.customer_lng ?? livePartnerPoint.lng],
                        ]}
                        pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '6 6' }}
                      />
                    )}
                  </MapContainer>
                </div>
              </section>
            )}

            <div className="customer-track-layout">
              <section className="customer-track-card">
                <div className="customer-track-card-head">
                  <h3>{t('delivery_timeline')}</h3>
                  <span>{progressPct}% complete</span>
                </div>
                <Timeline items={timelineItems} />
              </section>

              <section className="customer-track-card">
                <div className="customer-track-card-head">
                  <h3>{t('order_details')}</h3>
                  {statusChip(selectedOrder.status)}
                </div>

                <div className="customer-track-items">
                  {(selectedOrder.items || []).map((item) => (
                    <div key={item.id} className="customer-track-item-row">
                      <div className="customer-track-item-emoji">
                        {item.food_item_emoji || '🍽️'}
                      </div>
                      <div>
                        <div className="customer-track-item-name">
                          {item.food_item_name || `Item #${item.food_item_id}`}
                        </div>
                        <div className="customer-track-item-meta">x{item.quantity} · ₹{item.unit_price}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="customer-track-divider" />

                <div className="customer-track-meta-row">
                  <span>Delivery Address</span>
                  <strong>{selectedOrder.customer_address || '-'}</strong>
                </div>
                {selectedOrder.customer_landmark && (
                  <div className="customer-track-meta-row">
                    <span>Landmark</span>
                    <strong>{selectedOrder.customer_landmark}</strong>
                  </div>
                )}
                <div className="customer-track-meta-row">
                  <span>Order Status</span>
                  <strong>{statusLabel(selectedOrder.status)}</strong>
                </div>
                <div className="customer-track-meta-row">
                  <span>Delivery Partner</span>
                  <strong>{selectedOrder.partner_id ? `#${selectedOrder.partner_id}` : 'Not assigned yet'}</strong>
                </div>
                <div className="customer-track-meta-row">
                  <span>Partner Location</span>
                  <strong>
                    {livePartnerPoint
                      ? `${livePartnerPoint.lat.toFixed(5)}, ${livePartnerPoint.lng.toFixed(5)}`
                      : selectedOrder.partner_id
                        ? 'Waiting for live location'
                        : 'Not available yet'}
                  </strong>
                </div>
                <div className="customer-track-meta-row">
                  <span>{t('total_paid')}</span>
                  <strong>₹{selectedOrder.total_amount}</strong>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
