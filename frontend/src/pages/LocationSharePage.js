import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, MapPin, Clock, ExternalLink } from 'lucide-react';
import { getPublicLocation } from '../utils/api';

export default function LocationSharePage() {
  const { token } = useParams();
  const [position, setPosition] = useState(null);
  const [journeyInfo, setJourneyInfo] = useState(null);
  const [expired, setExpired] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let active = true;

    const loadLocation = async () => {
      try {
        const { data } = await getPublicLocation(token);
        if (!active) return;

        if (data?.expired) {
          setExpired(true);
          return;
        }

        setExpired(false);
        if (data?.lat && data?.lng) {
          setPosition({ lat: data.lat, lng: data.lng, accuracy: data.accuracy });
          setLastUpdated(data.updated_at || Date.now());
        } else {
          setPosition(null);
          setLastUpdated(data?.updated_at || null);
        }

        setJourneyInfo({
          passengerId: data?.passenger_id,
          trainNumber: data?.train_number,
          journeyDate: data?.journey_date,
        });
      } catch (error) {
        if (!active) return;
        setExpired(true);
      }
    };

    loadLocation();
    const intervalId = window.setInterval(loadLocation, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [token]);

  const timeAgo = (ts) => {
    if (!ts) return 'Never';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const googleMapsUrl = position
    ? `https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`
    : '';

  const googleEmbedUrl = position
    ? `https://maps.google.com/maps?q=${position.lat},${position.lng}&z=15&output=embed`
    : '';

  if (expired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏁</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', marginBottom: '0.5rem' }}>Journey Completed</h2>
          <p style={{ color: 'var(--text2)' }}>This location sharing link has expired. The journey has ended.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '1rem',
        background: 'rgba(8,13,26,0.95)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={14} color="#080d1a" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent)' }}>JourneyGuard</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
          <span style={{ width: 6, height: 6, background: position ? 'var(--success)' : 'var(--text3)', borderRadius: '50%', display: 'inline-block', animation: position ? 'blink 1.5s infinite' : 'none' }} />
          <span style={{ color: position ? 'var(--success)' : 'var(--text2)' }}>
            {position ? 'Live' : 'Waiting for location…'}
          </span>
        </div>
      </div>

      {/* Journey Info */}
      {journeyInfo && (
        <div style={{ padding: '0.9rem 1.5rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.8rem' }}><span style={{ color: 'var(--text2)' }}>Tracking: </span><span style={{ fontWeight: 600 }}>{journeyInfo.passengerId}</span></div>
          <div style={{ fontSize: '0.8rem' }}><span style={{ color: 'var(--text2)' }}>Train: </span><span style={{ fontWeight: 600 }}>{journeyInfo.trainNumber}</span></div>
          <div style={{ fontSize: '0.8rem' }}><span style={{ color: 'var(--text2)' }}>Date: </span><span style={{ fontWeight: 600 }}>{journeyInfo.journeyDate}</span></div>
          <div style={{ fontSize: '0.8rem', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text2)' }}>
            <Clock size={12} /> Updated: {timeAgo(lastUpdated)}
          </div>
        </div>
      )}

      {/* Map */}
      <div style={{ height: 'calc(100vh - 110px)' }}>
        {position ? (
          <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', background: 'rgba(8,13,26,0.92)' }}>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={16} />
                Open in Google Maps
              </a>
              <div style={{ color: 'var(--text2)', alignSelf: 'center' }}>
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </div>
            </div>
            <iframe
              title="Live train location"
              src={googleEmbedUrl}
              style={{ width: '100%', height: '100%', border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <MapPin size={36} color="var(--text3)" />
            <p style={{ color: 'var(--text2)', textAlign: 'center' }}>
              Waiting for the traveler to share their location…<br />
              <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>This page updates automatically</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
