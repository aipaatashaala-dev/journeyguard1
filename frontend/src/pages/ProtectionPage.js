import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocationTracker } from '../hooks/useLocationTracker';
import {
  getLocationLink,
  getProtectionState,
  startLocationTracking,
  startProtection,
  stopLocationTracking,
  stopProtection,
  updateProtectionLocation,
} from '../utils/api';
import toast from 'react-hot-toast';
import {
  Bell,
  Copy,
  ExternalLink,
  LocateFixed,
  Lock,
  MapPin,
  Radio,
  Shield,
  Smartphone,
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
    title: 'Vibration then alarm',
    text: 'If the phone is still locked, it vibrates for 10 seconds and then the alarm continues until the owner unlocks it.',
    icon: <Bell size={18} />,
  },
];

const formatTime = (value) => {
  if (!value) return 'Not synced yet';
  return new Date(value).toLocaleString();
};

export default function ProtectionPage() {
  const { user } = useAuth();
  const [journeyData, setJourneyData] = useState(null);
  const [loadingState, setLoadingState] = useState(true);
  const [savingState, setSavingState] = useState(false);
  const [locationSharingOn, setLocationSharingOn] = useState(() => localStorage.getItem('jg_location') === 'true');
  const [trackingLink, setTrackingLink] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [protectionState, setProtectionState] = useState(defaultProtectionState);

  useEffect(() => {
    const savedJourney = localStorage.getItem('jg_journey');
    if (savedJourney) {
      try {
        setJourneyData(JSON.parse(savedJourney));
      } catch (error) {
        console.error('Could not parse saved journey data:', error);
      }
    }
  }, []);

  const journeyId = useMemo(() => {
    const storedGroupId = localStorage.getItem('jg_group_id');
    if (storedGroupId) return storedGroupId;
    if (journeyData?.trainNumber && journeyData?.journeyDate) {
      return `${journeyData.trainNumber}_${journeyData.journeyDate}`;
    }
    return '';
  }, [journeyData?.trainNumber, journeyData?.journeyDate]);

  const passengerId = useMemo(() => {
    return (
      localStorage.getItem('jg_passenger_id') ||
      journeyData?.passengerId ||
      user?.email ||
      'JourneyGuard user'
    );
  }, [journeyData?.passengerId, user?.email]);

  const refreshProtectionState = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingState(true);
    try {
      const { data } = await getProtectionState();
      setProtectionState({ ...defaultProtectionState, ...data });
    } catch (error) {
      console.error('Could not load protection state:', error);
      if (showLoading) {
        toast.error(error?.response?.data?.detail || 'Could not load protection status');
      }
    } finally {
      if (showLoading) setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    refreshProtectionState(true);
    const intervalId = window.setInterval(() => refreshProtectionState(false), 15000);
    return () => window.clearInterval(intervalId);
  }, [refreshProtectionState]);

  useEffect(() => {
    if (!journeyId || !locationSharingOn) return;

    getLocationLink(journeyId)
      .then(({ data }) => {
        if (data?.tracking_link) {
          setTrackingLink(data.tracking_link);
          localStorage.setItem('jg_track_link', data.tracking_link);
        }
      })
      .catch((error) => {
        if (error?.response?.status === 404 || error?.response?.status === 410) {
          setTrackingLink('');
          localStorage.removeItem('jg_track_link');
        }
      });
  }, [journeyId, locationSharingOn]);

  const { position, error: locationError, accuracy } = useLocationTracker(
    journeyId,
    locationSharingOn
  );

  useEffect(() => {
    if (!locationSharingOn || !position) return;

    updateProtectionLocation({
      lat: position.lat,
      lng: position.lng,
      accuracy,
      location_enabled: true,
    })
      .then(({ data }) => {
        setProtectionState((prev) => ({ ...prev, ...data }));
      })
      .catch((error) => {
        console.error('Could not sync protection location:', error);
      });
  }, [position?.lat, position?.lng, accuracy, locationSharingOn]);

  const mapPosition = useMemo(() => {
    if (position) return position;
    if (protectionState.lat != null && protectionState.lng != null) {
      return { lat: protectionState.lat, lng: protectionState.lng };
    }
    return null;
  }, [position, protectionState.lat, protectionState.lng]);

  const googleMapsUrl = useMemo(() => {
    if (!mapPosition) return '';
    return `https://www.google.com/maps/search/?api=1&query=${mapPosition.lat},${mapPosition.lng}`;
  }, [mapPosition]);

  const googleEmbedUrl = useMemo(() => {
    if (!mapPosition) return '';
    return `https://maps.google.com/maps?q=${mapPosition.lat},${mapPosition.lng}&z=15&output=embed`;
  }, [mapPosition]);

  const handleStartProtection = async () => {
    setSavingState(true);
    try {
      const { data } = await startProtection({ location_enabled: locationSharingOn });
      setProtectionState({ ...defaultProtectionState, ...data });
      toast.success('Protection started from your dashboard');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not start protection');
    } finally {
      setSavingState(false);
    }
  };

  const handleStopProtection = async () => {
    setSavingState(true);
    try {
      const { data } = await stopProtection();
      setProtectionState({ ...defaultProtectionState, ...data });
      toast.success('Protection stopped');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not stop protection');
    } finally {
      setSavingState(false);
    }
  };

  const handleToggleLocation = async () => {
    const nextState = !locationSharingOn;
    setSavingState(true);

    try {
      if (nextState) {
        localStorage.setItem('jg_location', 'true');
        setLocationSharingOn(true);

        if (journeyId) {
          const { data } = await startLocationTracking({
            journey_id: journeyId,
            user_email: user?.email,
            passenger_id: passengerId,
            train_number: journeyData?.trainNumber || '',
            journey_date: journeyData?.journeyDate || '',
          });

          const link = data?.tracking_link || `${window.location.origin}/track/${journeyId}`;
          setTrackingLink(link);
          setEmailSent(Boolean(user?.email));
          localStorage.setItem('jg_track_link', link);
        } else {
          setTrackingLink('');
          setEmailSent(false);
        }

        if (protectionState.active) {
          const updated = await startProtection({ location_enabled: true });
          setProtectionState({ ...defaultProtectionState, ...updated.data });
        }

        if (journeyId) {
          toast.success('Mobile live location is now on');
        } else {
          toast.success('Live map is on for this device. Join a journey to generate a share link.');
        }
      } else {
        if (journeyId) {
          await stopLocationTracking(journeyId);
        }
        setTrackingLink('');
        setEmailSent(false);
        localStorage.removeItem('jg_track_link');
        localStorage.setItem('jg_location', 'false');
        setLocationSharingOn(false);

        if (protectionState.active) {
          const updated = await startProtection({ location_enabled: false });
          setProtectionState({ ...defaultProtectionState, ...updated.data });
        }

        toast.success('Mobile live location is now off');
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not update mobile live location');
    } finally {
      setSavingState(false);
    }
  };

  const copyLink = async () => {
    if (!trackingLink) return;
    await navigator.clipboard.writeText(trackingLink);
    toast.success('Tracking link copied');
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
            Protect the phone locally and monitor it remotely.
          </h1>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 860 }}>
            This page is now available from the sidebar and keeps your protection status in the backend,
            so you can open the same dashboard from another logged-in device. Start protection, share the
            mobile live location map, stop protection remotely, and explain the flow clearly to the user.
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
                  Start or stop protection from this dashboard. The current state is saved in the backend so you can check it remotely.
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
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleStartProtection}
                className="btn btn-primary"
                disabled={savingState || protectionState.active || loadingState}
              >
                Start Protection
              </button>
              <button
                type="button"
                onClick={handleStopProtection}
                className="btn btn-secondary"
                disabled={savingState || !protectionState.active || loadingState}
              >
                Stop Protection
              </button>
              <button
                type="button"
                onClick={handleToggleLocation}
                className="btn btn-secondary"
                disabled={savingState}
              >
                {locationSharingOn ? 'Stop Mobile Live Location' : 'Start Mobile Live Location'}
              </button>
            </div>

            <div className="field-card" style={{ background: 'rgba(233,116,24,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                <LocateFixed size={16} color="var(--accent2)" />
                <strong>Remote helpful mode</strong>
              </div>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                If your phone is far away, this dashboard still shows the latest protection state and the most recent shared location from the same account.
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.35rem' }}>
                  <MapPin size={18} color="var(--accent2)" />
                  <strong>Mobile live location map</strong>
                </div>
                <div style={{ color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520 }}>
                  The map below now uses the device location directly on this page. If a journey is active, JourneyGuard also generates a tracking link for remote sharing.
                </div>
              </div>
              <div className="route-pill" style={{ background: locationSharingOn ? 'rgba(59,139,255,0.14)' : 'rgba(76,42,20,0.1)', color: locationSharingOn ? 'var(--accent2)' : 'var(--text2)' }}>
                <MapPin size={14} />
                {locationSharingOn ? 'Live location on' : 'Live location off'}
              </div>
            </div>

            {trackingLink && (
              <div className="field-card">
                <div style={{ color: 'var(--text2)', fontSize: '0.82rem', marginBottom: '0.45rem' }}>Tracking link</div>
                <div style={{ wordBreak: 'break-all', marginBottom: '0.85rem' }}>{trackingLink}</div>
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={copyLink}>
                    <Copy size={14} /> Copy link
                  </button>
                  <a href={trackingLink} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                    <ExternalLink size={14} /> Open link
                  </a>
                </div>
              </div>
            )}

            {emailSent && user?.email && (
              <div className="field-card" style={{ background: 'rgba(59,139,255,0.08)' }}>
                Tracking link prepared for {user.email}
              </div>
            )}

            {locationError && (
              <div className="field-card" style={{ borderColor: 'rgba(223,79,104,0.22)', color: 'var(--danger)' }}>
                {locationError}
              </div>
            )}

            {!journeyId && (
              <div className="field-card" style={{ color: 'var(--text2)' }}>
                The live map can still work here. Start a journey from the main dashboard when you also want a shareable tracking link.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.9rem' }}>
              {mapPosition ? <Radio size={15} color="var(--success)" /> : <WifiOff size={15} color="var(--text3)" />}
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {mapPosition ? 'Google Maps live preview' : 'Waiting for mobile location'}
              </span>
              {mapPosition && (
                <span style={{ marginLeft: 'auto', fontSize: '0.74rem', color: 'var(--success)', fontWeight: 700 }}>
                  GOOGLE MAPS
                </span>
              )}
            </div>

            {mapPosition ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div className="field-card" style={{ padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Protected phone location</div>
                      <div style={{ color: 'var(--text2)', fontSize: '0.84rem' }}>
                        {mapPosition.lat.toFixed(5)}, {mapPosition.lng.toFixed(5)}
                        {accuracy ? ` • Accuracy ±${Math.round(accuracy)}m` : ''}
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
                  No device location yet.<br />
                  Start mobile live location to place the phone on the map.
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
              This matters because the user can understand exactly what JourneyGuard does before the alarm starts.
              The dashboard can be opened on mobile and remotely, while the device keeps reporting its latest protection state.
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
                Protection status, last update time, and the latest shared position are stored for the logged-in user so the page stays useful from another device.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
