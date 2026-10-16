import axios from 'axios';
import { UserProfile } from '../types';
import { resolveApiBaseUrl } from './apiBase';

const API_BASE = resolveApiBaseUrl();
const AUTH_TOKEN_KEY = 'token';
const AUTH_USER_KEY = 'user';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_USER_KEY);
      const method = error.config?.method?.toLowerCase();
      if (method === 'get' || method === 'delete') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const userService = {
  async me(): Promise<UserProfile> {
    const { data } = await api.get('/users/me/profile');
    return data;
  },

  async getById(userId: number): Promise<UserProfile> {
    const { data } = await api.get(`/users/${userId}`);
    return data;
  },
};
