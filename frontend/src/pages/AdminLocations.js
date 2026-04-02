import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { clearAdminSession, getAdminLocations, stopAdminLocation } from '../utils/adminApi';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function AdminLocations() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadLocations = async () => {
    try {
      const res = await getAdminLocations();
      setLocations(res.data);
      setSelectedLocation((current) => res.data.find((item) => item.id === current?.id) || res.data[0] || null);
    } catch (error) {
      clearAdminSession();
      toast.error(error?.response?.data?.detail || 'Could not load locations');
      navigate('/admin', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const stopTracking = async (locationId) => {
    if (!window.confirm('Stop tracking this location?')) return;
    try {
      await stopAdminLocation(locationId);
      toast.success('Tracking stopped');
      loadLocations();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to stop tracking');
    }
  };

  return (
    <div className="page-shell">
      <div className="container section-stack" style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/admin/dashboard" className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <div>
            <div className="section-label">Administration</div>
            <h1>Live Location Tracking</h1>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text2)' }}>Loading locations...</p>
          </div>
        ) : (
          <div className="split-grid">
            <div className="card">
              <h3 style={{ marginBottom: '1.25rem' }}>Active Locations ({locations.length})</h3>
              {locations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>No active location tracking</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="responsive-list-item"
                      style={{
                        padding: '1rem',
                        background: 'var(--surface2)',
                        borderRadius: 'var(--radius-sm)',
                        border: selectedLocation?.id === loc.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedLocation(loc)}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{loc.passenger_id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                        Train {loc.train_number} · Coach {loc.coach || '-'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.25rem' }}>
                        {loc.lat?.toFixed(5)}, {loc.lng?.toFixed(5)} · ±{loc.accuracy ?? '-'}m
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: '0.25rem' }}>
                        Updated: {loc.updated_at ? new Date(loc.updated_at).toLocaleString() : 'Unknown'}
                      </div>
                      <div className="responsive-actions" style={{ marginTop: '0.75rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); stopTracking(loc.id); }} className="btn btn-danger btn-sm">
                          Stop Tracking
                        </button>
                        {loc.lat && loc.lng && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Location Map</h3>
              {selectedLocation?.lat && selectedLocation?.lng ? (
                <MapContainer center={[selectedLocation.lat, selectedLocation.lng]} zoom={10} style={{ height: 'min(54vh, 400px)', borderRadius: 'var(--radius-sm)' }}>
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {locations.filter((loc) => loc.lat && loc.lng).map((loc) => (
                    <Marker key={loc.id} position={[loc.lat, loc.lng]}>
                      <Popup>
                        <strong>{loc.passenger_id}</strong><br />
                        Train {loc.train_number}<br />
                        {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              ) : (
                <div style={{ height: 'min(54vh, 400px)', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', textAlign: 'center', padding: '1rem' }}>
                  Select a location to view on map
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
