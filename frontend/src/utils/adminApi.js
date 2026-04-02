import axios from 'axios';
import { API_BASE_URL } from './config';

const ADMIN_TOKEN_KEY = 'jg_admin_token';
const ADMIN_EMAIL_KEY = 'jg_admin_email';
const ADMIN_EXPIRES_KEY = 'jg_admin_expires_at';

const adminApi = axios.create({ baseURL: API_BASE_URL });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const requestAdminOtp = (email) => adminApi.post('/admin/request-otp', { email });
export const verifyAdminOtp = (email, otp) => adminApi.post('/admin/verify-otp', { email, otp });
export const getAdminSession = () => adminApi.get('/admin/session');
export const getAdminStats = () => adminApi.get('/admin/stats');
export const getAdminUsers = () => adminApi.get('/admin/users');
export const deleteAdminUser = (uid) => adminApi.delete(`/admin/users/${uid}`);
export const getAdminJourneys = () => adminApi.get('/admin/journeys');
export const deleteAdminJourney = (groupId) => adminApi.delete(`/admin/journeys/${encodeURIComponent(groupId)}`);
export const getAdminLocations = () => adminApi.get('/admin/locations');
export const stopAdminLocation = (locationId) => adminApi.delete(`/admin/locations/${locationId}`);
export const getAdminRequests = () => adminApi.get('/admin/requests');
export const resolveAdminRequest = (groupId, requestId) => adminApi.delete(`/admin/requests/${groupId}/${requestId}`);

export function saveAdminSession(data) {
  localStorage.setItem(ADMIN_TOKEN_KEY, data.access_token);
  localStorage.setItem(ADMIN_EMAIL_KEY, data.admin_email);
  localStorage.setItem(ADMIN_EXPIRES_KEY, String(data.expires_at));
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_EMAIL_KEY);
  localStorage.removeItem(ADMIN_EXPIRES_KEY);
}

export function readAdminSession() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const adminEmail = localStorage.getItem(ADMIN_EMAIL_KEY);
  const expiresAt = Number(localStorage.getItem(ADMIN_EXPIRES_KEY) || 0);
  return { token, adminEmail, expiresAt };
}

export function hasValidAdminSession() {
  const { token, expiresAt } = readAdminSession();
  return Boolean(token) && Number.isFinite(expiresAt) && expiresAt * 1000 > Date.now();
}

export default adminApi;
