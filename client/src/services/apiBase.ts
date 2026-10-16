const DEFAULT_API_PORT = '8000';

export function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_API_PORT}`;
  }

  if (import.meta.env.DEV) {
    return window.location.origin;
  }

  const { hostname } = window.location;
  return `http://${hostname}:${DEFAULT_API_PORT}`;
}
