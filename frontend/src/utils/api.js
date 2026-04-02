import axios from 'axios';
import { auth } from '../firebase';
import { API_BASE_URL } from './config';

const api = axios.create({ baseURL: API_BASE_URL });

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

// ---------- Auth ----------
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);

// ---------- PNR ----------
export const fetchPnr = (pnr) => api.get(`/pnr/${pnr}`);
export const joinGroup = (data) => api.post('/journey/join', data);
export const leaveGroup = (journeyId) => api.post(`/journey/${journeyId}/leave`);

// ---------- Journey ----------
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

// ---------- Location ----------
export const startLocationTracking = (data) =>
  api.post('/location/start', data);
export const updateLocation = (data) =>
  api.post('/location/update', data);
export const stopLocationTracking = (journeyId) =>
  api.post(`/location/${journeyId}/stop`);
export const getLocationLink = (journeyId) =>
  api.get(`/location/${journeyId}/link`);

// ---------- Protection ----------
export const getProtectionState = () =>
  api.get('/protection/state');
export const startProtection = (data = {}) =>
  api.post('/protection/start', data);
export const stopProtection = () =>
  api.post('/protection/stop');
export const updateProtectionLocation = (data) =>
  api.post('/protection/location', data);

// ---------- AI ----------
export const getPrivateAiThread = (journeyId, coachId) =>
  api.get('/ai/group-thread', { params: { journey_id: journeyId, coach_id: coachId } });
export const sendPrivateAiMessage = (data) =>
  api.post('/ai/group-chat', data);
