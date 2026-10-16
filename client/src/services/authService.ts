import api from './api';
import { TokenResponse, UserRole } from '../types';

const AUTH_TOKEN_KEY = 'token';
const AUTH_USER_KEY = 'user';

export const authService = {
  async login(email: string, password: string, role: UserRole): Promise<TokenResponse> {
    const { data } = await api.post('/auth/login', { email, password, role });
    sessionStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data));
    return data;
  },

  async register(email: string, name: string, password: string, role: UserRole, phone?: string): Promise<TokenResponse> {
    const { data } = await api.post('/auth/register', { email, name, password, role, phone });
    sessionStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data));
    return data;
  },

  logout() {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
  },

  getCurrentUser() {
    const user = sessionStorage.getItem(AUTH_USER_KEY);
    if (!user) return null;
    try {
      return JSON.parse(user);
    } catch {
      sessionStorage.removeItem(AUTH_USER_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      return null;
    }
  },

  isLoggedIn() {
    return !!sessionStorage.getItem(AUTH_TOKEN_KEY);
  },
};
