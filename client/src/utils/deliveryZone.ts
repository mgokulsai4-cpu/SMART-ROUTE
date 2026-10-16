import type { GeoPoint } from './fleetSimulation';

export const DELIVERY_ZONE_CENTER: GeoPoint = { lat: 18.1086, lng: 83.4020 };
export const DELIVERY_ZONE_SIZE_KM = 10;
export const DELIVERY_ZONE_RADIUS_KM = DELIVERY_ZONE_SIZE_KM / 2;
export const FAR_PICKUP_DISTANCE_KM = 6;

export function randomPointInDeliveryZone(): GeoPoint {
  const angle = Math.random() * Math.PI * 2;
  const distanceKm = Math.sqrt(Math.random()) * DELIVERY_ZONE_RADIUS_KM;
  const latScale = 1 / 111.32;
  const lngScale = 1 / (111.32 * Math.max(0.2, Math.cos((DELIVERY_ZONE_CENTER.lat * Math.PI) / 180)));

  return {
    lat: DELIVERY_ZONE_CENTER.lat + Math.cos(angle) * distanceKm * latScale,
    lng: DELIVERY_ZONE_CENTER.lng + Math.sin(angle) * distanceKm * lngScale,
  };
}
