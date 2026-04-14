import axios from 'axios';
import { auth } from '../firebase';
import { API_BASE_URL } from './config';

const api = axios.create({ baseURL: API_BASE_URL });
export const TRAIN_GROUP_CHANNEL_ID = 'train_chat';

// Attach Firebase JWT to every request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export const getApiErrorMessage = (error, fallback = 'Request failed') => {
  const detail = error?.response?.data?.detail;
  const message = error?.response?.data?.message;

  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof message === 'string' && message.trim()) return message;

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.msg && item?.loc) {
          const loc = Array.isArray(item.loc) ? item.loc.join('.') : String(item.loc);
          return `${loc}: ${item.msg}`;
        }
        if (item?.msg) return item.msg;
        return '';
      })
      .filter(Boolean)
      .join(' | ') || fallback;
  }

  if (detail && typeof detail === 'object') {
    if (detail.message) return String(detail.message);
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return fallback;
};

const readStoredJourneySnapshot = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('jg_journey') || 'null');
    if (!stored?.trainNumber || !stored?.journeyDate) {
      return null;
    }

    const coach = stored.coach || 'general';
    const groupId = localStorage.getItem('jg_group_id') || `${stored.trainNumber}_${stored.journeyDate}`;
    const coachId = localStorage.getItem('jg_coach_id') || TRAIN_GROUP_CHANNEL_ID;

    return {
      group_id: groupId,
      coach_id: coachId,
      train_number: stored.trainNumber,
      train_name: stored.trainName || '',
      display_name: stored.displayName || '',
      journey_date: stored.journeyDate,
      coach,
      berth: stored.seat || stored.berth || '',
      berth_status: stored.berthStatus || '',
      join_mode: stored.joinMode || '',
      seat: stored.seat || stored.berth || '',
      passenger_id: localStorage.getItem('jg_passenger_id') || '',
    };
  } catch {
    return null;
  }
};

// ---------- Auth ----------
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);
export const requestPasswordResetOtp = (data) => api.post('/auth/forgot-password/request-otp', data);
export const verifyPasswordResetOtp = (data) => api.post('/auth/forgot-password/verify-otp', data);
export const resetPasswordWithOtp = (data) => api.post('/auth/forgot-password/reset', data);

// ---------- PNR ----------
export const fetchPnr = (pnr) => api.get(`/pnr/${pnr}`);
export const joinGroup = (data) => api.post('/journey/join', data);
export const leaveGroup = (journeyId) => api.post(`/journey/${journeyId}/leave`);

// ---------- Journey ----------
export const getCurrentJourney = () =>
  api.get('/journey/current');
export const getCurrentJourneyCompat = async () => {
  try {
    return await getCurrentJourney();
  } catch (error) {
    if (error?.response?.status === 404) {
      return { data: { journey: readStoredJourneySnapshot() } };
    }
    throw error;
  }
};
export const getJourneyGroup = (journeyId, coachId) =>
  api.get(`/journey/${journeyId}/coach/${coachId}`);
export const updateSeat = (journeyId, data) =>
  api.put(`/journey/${journeyId}/seat`, data);
export const endJourney = (journeyId) =>
  api.post(`/journey/${journeyId}/end`);

// ---------- Requests ----------
export const sendRequest = (data) => api.post('/requests', data);
export const getRequests = (journeyId, coachId) =>
  api.get(`/requests/${journeyId}/${coachId}`);
export const updateRequest = (journeyId, coachId, requestId, data) =>
  api.put(`/requests/${journeyId}/${coachId}/${requestId}`, data);
export const deleteRequest = (journeyId, coachId, requestId) =>
  api.delete(`/requests/${journeyId}/${coachId}/${requestId}`);
export const reportRequest = (journeyId, coachId, requestId, data = {}) =>
  api.post(`/requests/${journeyId}/${coachId}/${requestId}/report`, data);

// ---------- Location ----------
export const startLocationTracking = (data) =>
  api.post('/location/start', data);
export const updateLocation = (data) =>
  api.post('/location/update', data);
export const stopLocationTracking = (journeyId) =>
  api.post(`/location/${journeyId}/stop`);
export const getLocationStatus = (journeyId) =>
  api.get(`/location/${journeyId}`);
export const getLocationLink = (journeyId) =>
  api.get(`/location/${journeyId}/link`);
export const getPublicLocation = (token) =>
  api.get(`/location/public/${token}`);

// ---------- Protection ----------
export const getProtectionState = () =>
  api.get('/protection/state');
export const startProtection = (data = {}) =>
  api.post('/protection/start', data);
export const stopProtection = () =>
  api.post('/protection/stop');
export const updateProtectionLocation = (data) =>
  api.post('/protection/location', data);
export const startProtectionRing = (data = {}) =>
  api.post('/protection/ring/start', data);
export const stopProtectionRing = (data = {}) =>
  api.post('/protection/ring/stop', data);
