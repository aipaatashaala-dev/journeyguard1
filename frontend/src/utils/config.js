const normalizeBaseUrl = (value) => {
  if (!value) return '/api';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const isCapacitorRuntime = () =>
  typeof window !== 'undefined' &&
  typeof window.Capacitor?.getPlatform === 'function';

const resolveMobileLocalhost = (value) => {
  if (!value || !isCapacitorRuntime()) return value;

  const platform = window.Capacitor.getPlatform();
  if (platform !== 'android') return value;

  return value
    .replace('://localhost', '://10.0.2.2')
    .replace('://127.0.0.1', '://10.0.2.2');
};

const rawApiBaseUrl = process.env.REACT_APP_API_URL || '/api';

export const API_BASE_URL = normalizeBaseUrl(resolveMobileLocalhost(rawApiBaseUrl));
