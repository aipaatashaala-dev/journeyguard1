import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MapPin, Smartphone, Signal, Battery, Zap, Navigation, AlertCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { getCurrentJourneyCompat, getLocationStatus } from '../utils/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function LocationPage() {
  const { user } = useAuth();
  const [journeyData, setJourneyData] = useState(null);
  const [locationData, setLocationData] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [tracking, setTracking] = useState(false);

  // Load journey
  useEffect(() => {
    let active = true;

    const loadJourney = async () => {
      try {
        const { data } = await getCurrentJourneyCompat();
        if (!active) return;
        if (data?.journey) {
          setJourneyData({
            journeyId: data.journey.group_id,
            trainNumber: data.journey.train_number,
            coach: data.journey.coach || data.journey.coach_id?.replace('coach_', '') || 'general',
            journeyDate: data.journey.journey_date,
            berth: data.journey.berth || '',
          });
        }
      } catch (error) {
        if (!active) return;
        console.error('Failed to load journey for location page', error);
      }
    };

    loadJourney();

    return () => {
      active = false;
    };
  }, []);

  // Load location data
  useEffect(() => {
    if (!journeyData?.journeyId) return undefined;

    let active = true;

    const loadLocation = async () => {
      try {
        const { data } = await getLocationStatus(journeyData.journeyId);
        if (!active) return;
        setLocationData(data);
        setTracking(!data?.expired);
      } catch (error) {
        if (!active) return;
        setLocationData(null);
        setTracking(false);
      }
    };

    loadLocation();
    const intervalId = window.setInterval(loadLocation, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [journeyData?.journeyId]);

  // Get device position
  useEffect(() => {
    if (!tracking) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDeviceStatus({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          timestamp: new Date(),
        });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [tracking]);

  const getAccuracyColor = (acc) => {
    if (acc < 10) return 'var(--success)';
    if (acc < 50) return 'var(--accent2)';
    return 'var(--danger)';
  };

  if (!journeyData) {
    return (
      <div style={{ marginLeft: 280, padding: '2rem' }}>
        <div style={{ textAlign: 'center', color: 'var(--text2)' }}>
          <MapPin size={32} style={{ margin: '0 auto', marginBottom: '1rem', opacity: 0.5 }} />
          <p>Start a journey first to enable location tracking</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginLeft: 280, minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '2rem 2rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>📍 Live Location</h1>
        <p style={{ color: 'var(--text2)' }}>Real-time device tracking and status monitoring</p>
      </div>

      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
        {/* Status Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
              <Smartphone size={18} color="var(--accent)" />
              <span style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>Tracking Status</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: tracking ? 'var(--success)' : 'var(--text3)' }}>
              {tracking ? '🟢 Active' : '🔴 Inactive'}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
              <Signal size={18} color="var(--accent2)" />
              <span style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>GPS Accuracy</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: getAccuracyColor(deviceStatus?.accuracy || 100) }}>
              {deviceStatus?.accuracy ? `±${Math.round(deviceStatus.accuracy)}m` : 'N/A'}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
              <Navigation size={18} color="var(--accent3)" />
              <span style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>Speed</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>
              {deviceStatus?.speed ? `${(deviceStatus.speed * 3.6).toFixed(1)} km/h` : '0 km/h'}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
              <Zap size={18} color="var(--accent)" />
              <span style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>Last Update</span>
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text)' }}>
              {deviceStatus?.timestamp ? deviceStatus.timestamp.toLocaleTimeString() : 'Waiting...'}
            </div>
          </div>
        </div>

        {/* Map Section */}
        {deviceStatus && (
          <div className="card" style={{ marginBottom: '2rem', padding: 0, overflow: 'hidden', height: 400 }}>
            <MapContainer center={[deviceStatus.lat, deviceStatus.lng]} zoom={15} style={{ width: '100%', height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              <Marker position={[deviceStatus.lat, deviceStatus.lng]}>
                <Popup>
                  <div>
                    <strong>Current Location</strong><br />
                    Lat: {deviceStatus.lat.toFixed(6)}<br />
                    Lng: {deviceStatus.lng.toFixed(6)}<br />
                    Accuracy: ±{Math.round(deviceStatus.accuracy)}m
                  </div>
                </Popup>
              </Marker>
              <Circle center={[deviceStatus.lat, deviceStatus.lng]} radius={deviceStatus.accuracy} color="var(--accent)" fillOpacity={0.1} />
            </MapContainer>
          </div>
        )}

        {/* Journey Info */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>🚂 Journey Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', fontSize: '0.95rem' }}>
            <div>
              <div style={{ color: 'var(--text2)', marginBottom: '0.3rem' }}>Train Number</div>
              <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{journeyData.trainNumber}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text2)', marginBottom: '0.3rem' }}>Coach</div>
              <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{journeyData.coach}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text2)', marginBottom: '0.3rem' }}>Date</div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{journeyData.journeyDate}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text2)', marginBottom: '0.3rem' }}>Berth</div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{journeyData.berth}</div>
            </div>
          </div>
        </div>

        {/* Device Coordinates */}
        {deviceStatus && (
          <div className="card" style={{ padding: '1.5rem', background: 'var(--surface2)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              📌 Precise Coordinates
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
              <div>
                <div style={{ color: 'var(--text2)', marginBottom: '0.3rem' }}>Latitude</div>
                <code style={{ background: 'var(--surface)', padding: '0.5rem 0.75rem', borderRadius: 4, color: 'var(--accent)', display: 'block', wordBreak: 'break-all' }}>
                  {deviceStatus.lat.toFixed(8)}
                </code>
              </div>
              <div>
                <div style={{ color: 'var(--text2)', marginBottom: '0.3rem' }}>Longitude</div>
                <code style={{ background: 'var(--surface)', padding: '0.5rem 0.75rem', borderRadius: 4, color: 'var(--accent)', display: 'block', wordBreak: 'break-all' }}>
                  {deviceStatus.lng.toFixed(8)}
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
