import { useState } from 'react';
import { GeoPoint } from '../utils/fleetSimulation';
import { DELIVERY_ZONE_CENTER, DELIVERY_ZONE_RADIUS_KM } from '../utils/deliveryZone';
import { routingService } from '../services/routingService';
import RestaurantMap from './RestaurantMap';

interface LocationPickerProps {
  userLocation: GeoPoint | null;
  onLocationSelect: (point: GeoPoint) => void;
  compact?: boolean;
}

const AREA_CENTER: GeoPoint = DELIVERY_ZONE_CENTER;
const AREA_RADIUS_KM = DELIVERY_ZONE_RADIUS_KM;
const AREA_RADIUS_M = AREA_RADIUS_KM * 1000;

export default function LocationPicker({ userLocation, onLocationSelect, compact = false }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [tempLocation, setTempLocation] = useState<GeoPoint | null>(userLocation);
  const [manualAddress, setManualAddress] = useState('');
  const [matchedAddress, setMatchedAddress] = useState('');
  const [manualLat, setManualLat] = useState(userLocation ? userLocation.lat.toFixed(6) : '');
  const [manualLng, setManualLng] = useState(userLocation ? userLocation.lng.toFixed(6) : '');
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const openModal = () => {
    setManualAddress('');
    setMatchedAddress('');
    if (userLocation) {
      setManualLat(userLocation.lat.toFixed(6));
      setManualLng(userLocation.lng.toFixed(6));
    } else {
      setManualLat('');
      setManualLng('');
    }
    setTempLocation(userLocation);
    setOpen(true);
    setSelecting(true);
    setError('');
  };

  const closeModal = () => {
    setOpen(false);
    setSelecting(false);
    setDetecting(false);
    setGeocoding(false);
    setError('');
  };

  const isWithinDeliveryZone = (point: GeoPoint) => {
    const dLat = ((point.lat - AREA_CENTER.lat) * Math.PI) / 180;
    const dLng = ((point.lng - AREA_CENTER.lng) * Math.PI) / 180;
    const lat1 = (AREA_CENTER.lat * Math.PI) / 180;
    const lat2 = (point.lat * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    const distanceMeters = 2 * 6371000 * Math.asin(Math.sqrt(h));
    return distanceMeters <= AREA_RADIUS_M;
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location access is not available in this browser.');
      return;
    }

    setDetecting(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTempLocation(point);
        setManualLat(point.lat.toFixed(6));
        setManualLng(point.lng.toFixed(6));
        setMatchedAddress('');
        setSelecting(false);
        setDetecting(false);
      },
      () => {
        setDetecting(false);
        setError('Could not read your current location. Click on the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const applyAddressLookup = async () => {
    const query = manualAddress.trim();
    if (!query) {
      setError('Enter an address or landmark to search.');
      return;
    }

    setGeocoding(true);
    setError('');

    try {
      let result = await routingService.geocodeAddress(query);

      if (!result && !/vizianagaram/i.test(query)) {
        result = await routingService.geocodeAddress(`${query}, Vizianagaram`);
      }

      if (!result) {
        setError('Could not find this address. Try adding area name (e.g. Dasannapeta).');
        return;
      }

      const point = { lat: result.lat, lng: result.lng };
      if (!isWithinDeliveryZone(point)) {
        setError(`Address is outside the ${AREA_RADIUS_KM} km delivery zone.`);
        return;
      }

      setTempLocation(point);
      setManualLat(point.lat.toFixed(6));
      setManualLng(point.lng.toFixed(6));
      setMatchedAddress(result.displayName);
      setSelecting(false);
      setError('');
    } catch {
      setError('Address search failed. Please try again or enter coordinates.');
    } finally {
      setGeocoding(false);
    }
  };

  const useManualCoordinates = () => {
    const lat = Number(manualLat.trim());
    const lng = Number(manualLng.trim());

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Enter valid latitude and longitude values.');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Latitude must be between -90 and 90, longitude between -180 and 180.');
      return;
    }

    const point = { lat, lng };
    if (!isWithinDeliveryZone(point)) {
      setError(`Selected location must be within the ${AREA_RADIUS_KM} km delivery zone.`);
      return;
    }

    setTempLocation(point);
    setMatchedAddress('');
    setSelecting(false);
    setError('');
  };

  const confirmLocation = () => {
    if (!tempLocation) {
      setError('Pick a location on the map first.');
      return;
    }

    if (!isWithinDeliveryZone(tempLocation)) {
      setError(`Selected location must be within the ${AREA_RADIUS_KM} km delivery zone.`);
      return;
    }

    onLocationSelect(tempLocation);
    closeModal();
  };

  const formatLocationLabel = (loc: GeoPoint) => {
    const lat = loc.lat.toFixed(3);
    const lng = loc.lng.toFixed(3);
    return `${lat}, ${lng}`;
  };

  return (
    <>
      {compact ? (
        <button type="button" className="location-picker-pill" onClick={openModal}>
          <span className="location-picker-pill-icon">📍</span>
          {userLocation ? (
            <span className="location-picker-pill-label">Deliver to {formatLocationLabel(userLocation)}</span>
          ) : (
            <span className="location-picker-pill-label">Select Location</span>
          )}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={openModal}>
          📍 {userLocation ? 'Change Location' : 'Select Location'}
        </button>
      )}

      {open && (
        <div className="location-picker-modal-overlay" onClick={closeModal}>
          <div className="location-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="location-picker-modal-header">
              <h3>Set Delivery Location</h3>
              <button type="button" className="location-picker-modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="location-picker-modal-tip">
              {selecting ? (
                <span>Click on the map to pin your delivery location</span>
              ) : (
                <span>Enable location selection to choose a point</span>
              )}
            </div>
            <div className="location-picker-manual">
              <div className="location-picker-manual-title">Add location manually</div>
              <div className="location-picker-manual-address-row">
                <input
                  className="location-picker-manual-input"
                  type="text"
                  placeholder="Search by address / landmark"
                  value={manualAddress}
                  onChange={(e) => {
                    setManualAddress(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void applyAddressLookup();
                  }}
                  disabled={geocoding || !manualAddress.trim()}
                >
                  {geocoding ? 'Searching...' : 'Use Address'}
                </button>
              </div>
              {matchedAddress && (
                <div className="location-picker-manual-result">Matched: {matchedAddress}</div>
              )}
              <div className="location-picker-manual-grid">
                <input
                  className="location-picker-manual-input"
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={manualLat}
                  onChange={(e) => {
                    setManualLat(e.target.value);
                    setError('');
                  }}
                />
                <input
                  className="location-picker-manual-input"
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={manualLng}
                  onChange={(e) => {
                    setManualLng(e.target.value);
                    setError('');
                  }}
                />
                <button type="button" className="btn btn-ghost" onClick={useManualCoordinates}>
                  Use Coordinates
                </button>
              </div>
            </div>
            {error && (
              <div style={{ padding: '10px 20px', color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {error}
              </div>
            )}
            <div className="location-picker-map-container">
              <RestaurantMap
                restaurants={[]}
                center={[tempLocation?.lat ?? AREA_CENTER.lat, tempLocation?.lng ?? AREA_CENTER.lng]}
                zoom={12}
                selectable={selecting}
                userLocation={tempLocation}
                onLocationSelect={(point) => {
                  setTempLocation(point);
                  setManualLat(point.lat.toFixed(6));
                  setManualLng(point.lng.toFixed(6));
                  setSelecting(false);
                  setError('');
                }}
                showDeliveryZone={true}
                zoneCenter={AREA_CENTER}
                zoneRadiusKm={AREA_RADIUS_KM}
                showLegend={true}
              />
            </div>
            <div className="location-picker-modal-footer">
              <button type="button" className="btn btn-ghost" onClick={useCurrentLocation} disabled={detecting}>
                {detecting ? 'Detecting...' : 'Use Current Location'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmLocation}
                disabled={!tempLocation}
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
