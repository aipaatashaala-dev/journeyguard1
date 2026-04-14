import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getApiErrorMessage,
  getProtectionState,
  startProtection,
  startProtectionRing,
  stopProtection,
  stopProtectionRing,
} from '../utils/api';
import toast from 'react-hot-toast';
import {
  Bell,
  ExternalLink,
  LocateFixed,
  Lock,
  MapPin,
  Radio,
  Shield,
  Smartphone,
  Volume2,
  WifiOff,
} from 'lucide-react';

const defaultProtectionState = {
  active: false,
  location_enabled: false,
  email: '',
  updated_at: 0,
  started_at: 0,
  lat: null,
  lng: null,
  accuracy: null,
  source: 'remote-dashboard',
  ring_requested_at: 0,
  ring_stop_requested_at: 0,
};

const workSteps = [
  {
    title: 'Sensor reading detection',
    text: 'The protected phone watches motion signals from its mobile sensors while the protection mode is active.',
    icon: <Smartphone size={18} />,
  },
  {
    title: '10-second lock check',
    text: 'When motion is detected, JourneyGuard waits 10 seconds and gives the owner time to unlock the phone.',
    icon: <Lock size={18} />,
  },
  {
    title: 'Find phone ring',
    text: 'If you open this page on another system with the same account, you can send a ring command to help locate the far-away phone.',
    icon: <Volume2 size={18} />,
  },
];

const formatTime = (value) => {
  if (!value) return 'Not synced yet';
  return new Date(value).toLocaleString();
};

const formatSource = (value) => {
  if (value === 'mobile-device') return 'Phone app';
  if (value === 'remote-dashboard') return 'Remote dashboard';
  return 'Not synced';
};

export default function ProtectionPage() {
  const { user } = useAuth();
  const [loadingState, setLoadingState] = useState(true);
  const [savingState, setSavingState] = useState(false);
  const [protectionState, setProtectionState] = useState(defaultProtectionState);

  const refreshProtectionState = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingState(true);
    try {
      const { data } = await getProtectionState();
      setProtectionState({ ...defaultProtectionState, ...data });
    } catch (error) {
      console.error('Could not load protection state:', error);
      if (showLoading) {
        toast.error(getApiErrorMessage(error, 'Could not load protection status'));
      }
    } finally {
      if (showLoading) setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    refreshProtectionState(true);
    const intervalId = window.setInterval(() => refreshProtectionState(false), 3000);
    return () => window.clearInterval(intervalId);
  }, [refreshProtectionState]);

  const mapPosition = useMemo(() => {
    if (protectionState.lat != null && protectionState.lng != null) {
      return { lat: protectionState.lat, lng: protectionState.lng };
    }
    return null;
  }, [protectionState.lat, protectionState.lng]);

  const googleMapsUrl = useMemo(() => {
    if (!mapPosition) return '';
    return `https://www.google.com/maps/search/?api=1&query=${mapPosition.lat},${mapPosition.lng}`;
  }, [mapPosition]);

  const googleEmbedUrl = useMemo(() => {
    if (!mapPosition) return '';
    return `https://maps.google.com/maps?q=${mapPosition.lat},${mapPosition.lng}&z=15&output=embed`;
  }, [mapPosition]);

  const isRinging = useMemo(() => {
    return (
      (protectionState.ring_requested_at || 0) >
      (protectionState.ring_stop_requested_at || 0)
    );
  }, [protectionState.ring_requested_at, protectionState.ring_stop_requested_at]);

  const handleStartProtection = async () => {
    setSavingState(true);
    try {
      const { data } = await startProtection({ location_enabled: true });
      setProtectionState({ ...defaultProtectionState, ...data });
      toast.success('Protection start command sent');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not start protection'));
    } finally {
      setSavingState(false);
    }
  };

  const handleStopProtection = async () => {
    setSavingState(true);
    try {
      const { data } = await stopProtection();
      setProtectionState({ ...defaultProtectionState, ...data });
      toast.success('Protection stop command sent');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not stop protection'));
    } finally {
      setSavingState(false);
    }
  };

  const handleStartRing = async () => {
    setSavingState(true);
    try {
      const { data } = await startProtectionRing();
      setProtectionState({ ...defaultProtectionState, ...data });
      toast.success('Ring command sent to the phone');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not start ring'));
    } finally {
      setSavingState(false);
    }
  };

  const handleStopRing = async () => {
    setSavingState(true);
    try {
      const { data } = await stopProtectionRing();
      setProtectionState({ ...defaultProtectionState, ...data });
      toast.success('Stop ring command sent');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not stop ring'));
    } finally {
      setSavingState(false);
    }
  };

  const handleToggleRing = async () => {
    if (isRinging) {
      await handleStopRing();
      return;
    }

    await handleStartRing();
  };

  return (
    <div className="page-shell">
      <div className="container section-stack" style={{ maxWidth: 1200 }}>
        <div className="rail-shell" style={{ padding: 'clamp(1.2rem, 3vw, 2rem)' }}>
          <div className="route-pill" style={{ marginBottom: '1rem' }}>
            <Shield size={14} />
            Protection Dashboard
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3.1rem)', marginBottom: '0.75rem' }}>
            Protect, locate, and ring your phone from another system.
          </h1>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 860 }}>
            When the same account is open on another laptop or system, this page shows the phone app&apos;s synced
            location instead of the current browser location. You can start protection remotely and trigger a find-phone ring.
          </p>
        </div>

        <div className="dashboard-grid" style={{ alignItems: 'stretch' }}>
          <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.35rem' }}>
                  <Shield size={18} color="var(--accent)" />
                  <strong>Protection controls</strong>
                </div>
                <div style={{ color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520 }}>
                  The phone app and this dashboard now use the same account session. Commands sent here are meant for the signed-in phone.
                </div>
              </div>
              <div className="route-pill" style={{ background: protectionState.active ? 'rgba(31,157,114,0.14)' : 'rgba(223,79,104,0.14)', color: protectionState.active ? 'var(--success)' : 'var(--danger)' }}>
                <Radio size={14} />
                {protectionState.active ? 'Protection active' : 'Protection stopped'}
              </div>
            </div>

            <div className="dashboard-grid" style={{ margin: 0 }}>
              <div className="field-card">
                <div style={{ color: 'var(--text2)', fontSize: '0.82rem', marginBottom: '0.35rem' }}>Account</div>
                <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{user?.email || protectionState.email || 'Not available'}</div>
              </div>
              <div className="field-card">
                <div style={{ color: 'var(--text2)', fontSize: '0.82rem', marginBottom: '0.35rem' }}>Last sync</div>
                <div style={{ fontWeight: 700 }}>{formatTime(protectionState.updated_at)}</div>
              </div>
              <div className="field-card">
                <div style={{ color: 'var(--text2)', fontSize: '0.82rem', marginBottom: '0.35rem' }}>Last controller</div>
                <div style={{ fontWeight: 700 }}>{formatSource(protectionState.source)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleStartProtection}
                className="btn btn-primary"
                disabled={savingState || protectionState.active || loadingState}
              >
                Start Protection Remotely
              </button>
              <button
                type="button"
                onClick={handleStopProtection}
                className="btn btn-secondary"
                disabled={savingState || !protectionState.active || loadingState}
              >
                Stop Protection Remotely
              </button>
            </div>

            <div className="field-card" style={{ background: isRinging ? 'rgba(223,79,104,0.08)' : 'rgba(233,116,24,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                <Bell size={16} color={isRinging ? 'var(--danger)' : 'var(--accent2)'} />
                <strong>Find phone</strong>
              </div>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7, marginBottom: '0.9rem' }}>
                Use this when the far-away phone is signed into the same account. The phone app can start a loud ring alarm to help you find it.
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleToggleRing}
                  className="btn btn-primary"
                  disabled={savingState || loadingState}
                >
                  {isRinging ? 'Stop Ringing Mobile Remotely' : 'Start Ringing Mobile Remotely'}
                </button>
              </div>
            </div>

            <div className="field-card" style={{ background: 'rgba(233,116,24,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                <LocateFixed size={16} color="var(--accent2)" />
                <strong>Remote helpful mode</strong>
              </div>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                This map now depends on the mobile app&apos;s synced location. Opening this page on another system will not use that system&apos;s browser location.
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.35rem' }}>
                  <MapPin size={18} color="var(--accent2)" />
                  <strong>Synced mobile location</strong>
                </div>
                <div style={{ color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520 }}>
                  This location is the latest position shared by the signed-in phone app, not the browser currently viewing this page.
                </div>
              </div>
              <div className="route-pill" style={{ background: mapPosition ? 'rgba(59,139,255,0.14)' : 'rgba(76,42,20,0.1)', color: mapPosition ? 'var(--accent2)' : 'var(--text2)' }}>
                <MapPin size={14} />
                {mapPosition ? 'Phone location synced' : 'Waiting for phone location'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.9rem' }}>
              {mapPosition ? <Radio size={15} color="var(--success)" /> : <WifiOff size={15} color="var(--text3)" />}
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {mapPosition ? 'Google Maps phone preview' : 'No synced phone location yet'}
              </span>
              {mapPosition && (
                <span style={{ marginLeft: 'auto', fontSize: '0.74rem', color: 'var(--success)', fontWeight: 700 }}>
                  PHONE APP
                </span>
              )}
            </div>

            {mapPosition ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div className="field-card" style={{ padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Phone location</div>
                      <div style={{ color: 'var(--text2)', fontSize: '0.84rem' }}>
                        {mapPosition.lat.toFixed(5)}, {mapPosition.lng.toFixed(5)}
                        {protectionState.accuracy ? ` • Accuracy ±${Math.round(protectionState.accuracy)}m` : ''}
                      </div>
                    </div>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ textDecoration: 'none' }}
                    >
                      <ExternalLink size={14} /> Open in Google Maps
                    </a>
                  </div>
                </div>
                <iframe
                  title="Protected phone live location"
                  src={googleEmbedUrl}
                  style={{ width: '100%', height: 'min(52vh, 360px)', border: 0, borderRadius: 'var(--radius-sm)' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div style={{ height: 'min(52vh, 360px)', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', textAlign: 'center', color: 'var(--text2)' }}>
                <WifiOff size={34} color="var(--text3)" />
                <div>
                  No phone location has been synced yet.<br />
                  Open the phone app with the same account so it can share the mobile location here.
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
          <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.35rem' }}>
              <Shield size={18} color="var(--accent)" />
              <strong>How protection works</strong>
            </div>
            <p style={{ color: 'var(--text2)', lineHeight: 1.75, margin: 0 }}>
              The mobile app is the source of truth for sensors, ringing, and synced phone coordinates. This web page is the remote control and remote viewer for the same account.
            </p>

            {workSteps.map((step) => (
              <div key={step.title} className="field-card" style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(233,116,24,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  {step.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>{step.title}</div>
                  <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{step.text}</div>
                </div>
              </div>
            ))}

            <div className="field-card" style={{ background: 'rgba(31,157,114,0.08)' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Current backend sync</div>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                Protection status, ring commands, and the latest phone location are stored for the logged-in account so another system can help find the phone.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
