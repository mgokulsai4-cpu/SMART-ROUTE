import api from './api';
import { DeliveryPartner, HelmetMonitorStatus, Violation } from '../types';

export const deliveryService = {
  async me(): Promise<DeliveryPartner> {
    const { data } = await api.get('/delivery/me');
    return data;
  },

  async listPartners(status?: string): Promise<DeliveryPartner[]> {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    const { data } = await api.get('/delivery/partners', { params });
    return data;
  },

  async getPartner(id: number): Promise<DeliveryPartner> {
    const { data } = await api.get(`/delivery/partners/${id}`);
    return data;
  },

  async updateLocation(lat: number, lng: number, speed_kmh: number, bearing?: number) {
    const { data } = await api.post('/delivery/location', { lat, lng, speed_kmh, bearing });
    return data;
  },

  async getLocationHistory(partnerId: number, limit: number = 20) {
    const { data } = await api.get(`/delivery/location/${partnerId}`, { params: { limit } });
    return data;
  },

  async updatePartner(id: number, updates: Partial<DeliveryPartner>) {
    const { data } = await api.patch(`/delivery/partners/${id}`, updates);
    return data;
  },

  async updateMySafety(payload: { helmet_detected?: boolean; camera_active?: boolean }) {
    const { data } = await api.patch('/delivery/me/safety', payload);
    return data;
  },

  async reportHelmetMonitor(payload: {
    helmet_detected: boolean;
    camera_active?: boolean;
    is_navigating?: boolean;
    lat?: number;
    lng?: number;
  }): Promise<HelmetMonitorStatus> {
    const { data } = await api.post('/delivery/me/helmet-monitor', payload);
    return data;
  },

  async getSafetyHistory(limit: number = 20): Promise<Violation[]> {
    const { data } = await api.get('/delivery/me/safety-history', { params: { limit } });
    return data;
  },
};
