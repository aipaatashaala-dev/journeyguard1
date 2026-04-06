import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../utils/config';
import { getCurrentJourneyCompat, TRAIN_GROUP_CHANNEL_ID } from '../utils/api';
import { formatTrainGroupName } from '../utils/groupNames';
import {
  ChevronRight,
  Ticket,
  PenSquare,
  Users,
  MapPinned,
  TrainFront,
  CalendarDays,
  ArrowRight,
  X,
} from 'lucide-react';

const formatDate = (date) => new Date(date).toISOString().split('T')[0];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [currentJourney, setCurrentJourney] = useState(null);
  const [pnr, setPnr] = useState('');
  const [manual, setManual] = useState({
    trainNumber: '',
    journeyDate: formatDate(new Date()),
    coach: '',
    seat: '',
  });
  const [general, setGeneral] = useState({
    trainNumber: '',
    journeyDate: formatDate(new Date()),
  });
  const [loading, setLoading] = useState(false);
  const [showPnrModal, setShowPnrModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showGeneralModal, setShowGeneralModal] = useState(false);
  const [pnrDetails, setPnrDetails] = useState(null);
  const [pnrFetching, setPnrFetching] = useState(false);
  const [selectedBerth, setSelectedBerth] = useState('');
  const [pnrJourneyDate, setPnrJourneyDate] = useState(formatDate(new Date()));
  const [manualTrainDetails, setManualTrainDetails] = useState(null);
  const [generalTrainDetails, setGeneralTrainDetails] = useState(null);
  const [manualTrainFetching, setManualTrainFetching] = useState(false);
  const [generalTrainFetching, setGeneralTrainFetching] = useState(false);
  const [manualTrainConfirmed, setManualTrainConfirmed] = useState(false);
  const [generalTrainConfirmed, setGeneralTrainConfirmed] = useState(false);

  const clearStoredJourney = () => {
    localStorage.removeItem('jg_journey');
    localStorage.removeItem('jg_group_id');
    localStorage.removeItem('jg_coach_id');
    localStorage.removeItem('jg_passenger_id');
    localStorage.removeItem('jg_journey_started');
    setCurrentJourney(null);
  };

  useEffect(() => {
    const saved = localStorage.getItem('jg_journey');
    if (saved) {
      const journey = JSON.parse(saved);
      setCurrentJourney(journey);
      setManual((prev) => ({
        ...prev,
        trainNumber: journey.trainNumber || prev.trainNumber,
        journeyDate: journey.journeyDate || prev.journeyDate,
        coach: journey.coach || prev.coach,
        seat: journey.seat || prev.seat,
      }));
      setGeneral((prev) => ({
        ...prev,
        trainNumber: journey.trainNumber || prev.trainNumber,
        journeyDate: journey.journeyDate || prev.journeyDate,
      }));
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

    let active = true;

    const syncCurrentJourney = async () => {
      try {
        const { data } = await getCurrentJourneyCompat();
        if (!active) return;

        const serverJourney = data?.journey;
        if (!serverJourney) {
          clearStoredJourney();
          return;
        }

        const storedJourney = JSON.parse(localStorage.getItem('jg_journey') || '{}');
        const nextJourney = {
          trainNumber: serverJourney.train_number,
          trainName: serverJourney.train_name || storedJourney.trainName || '',
          journeyDate: serverJourney.journey_date,
          coach: serverJourney.coach || 'general',
          seat: serverJourney.berth || serverJourney.seat || '',
        };

        localStorage.setItem('jg_journey', JSON.stringify(nextJourney));
        localStorage.setItem('jg_group_id', serverJourney.group_id || `${nextJourney.trainNumber}_${nextJourney.journeyDate}`);
        localStorage.setItem('jg_coach_id', serverJourney.coach_id || TRAIN_GROUP_CHANNEL_ID);
        if (serverJourney.passenger_id) {
          localStorage.setItem('jg_passenger_id', serverJourney.passenger_id);
        }
        setCurrentJourney(nextJourney);
      } catch (error) {
        if (!active) return;
        if (error?.response?.status === 401) return;
        console.error('Failed to sync current journey', error);
      }
    };

    syncCurrentJourney();
    const intervalId = window.setInterval(syncCurrentJourney, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user?.uid]);

  useEffect(() => {
    setManualTrainDetails(null);
    setManualTrainConfirmed(false);
  }, [manual.trainNumber, manual.journeyDate]);

  useEffect(() => {
    setGeneralTrainDetails(null);
    setGeneralTrainConfirmed(false);
  }, [general.trainNumber, general.journeyDate]);

  const getGroupPath = (journey, coachId) => {
    const groupId = `${journey.trainNumber}_${journey.journeyDate}`;
    const coachKey = coachId || TRAIN_GROUP_CHANNEL_ID;
    return `/group/${groupId}/${coachKey}`;
  };

  const joinBackgroundGroup = async ({ trainNumber, journeyDate, coach = 'general', berth = '', arrivalTime = null }) => {
    if (!trainNumber || !journeyDate) {
      toast.error('Train number and date are required');
      throw new Error('validation');
    }

    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/journey/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        train_number: trainNumber,
        journey_date: journeyDate,
        coach,
        berth,
        arrival_time: arrivalTime,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || 'Could not join train group');
      throw new Error('join_failed');
    }

    const data = await res.json();
    localStorage.setItem('jg_group_id', data.group_id);
    localStorage.setItem('jg_coach_id', data.coach_id);
    localStorage.setItem('jg_passenger_id', data.passenger_id);
    localStorage.setItem('jg_journey_started', new Date().toISOString());

    return data;
  };

  const handleJoinSuccess = async (journey, coachId) => {
    localStorage.setItem('jg_journey', JSON.stringify(journey));
    setCurrentJourney(journey);
    navigate(getGroupPath(journey, coachId));
  };

  const fetchTrainDetails = async ({ trainNumber, journeyDate, mode }) => {
    if (!trainNumber || !journeyDate) {
      toast.error('Enter train number and journey date first');
      return;
    }

    const setLoadingState = mode === 'manual' ? setManualTrainFetching : setGeneralTrainFetching;
    const setDetailsState = mode === 'manual' ? setManualTrainDetails : setGeneralTrainDetails;

    setLoadingState(true);
    try {
      const token = await user.getIdToken();
      const query = new URLSearchParams({ journey_date: journeyDate }).toString();
      const res = await fetch(`${API_BASE_URL}/journey/train-info/${encodeURIComponent(trainNumber)}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.train_exists) {
        setDetailsState(null);
        if (mode === 'manual') setManualTrainConfirmed(false);
        if (mode === 'general') setGeneralTrainConfirmed(false);
        toast.error(data.detail || `Train ${trainNumber} details not found`);
        return;
      }

      setDetailsState(data);
      if (mode === 'manual') setManualTrainConfirmed(false);
      if (mode === 'general') setGeneralTrainConfirmed(false);
      toast.success('Train details loaded');
    } catch (err) {
      setDetailsState(null);
      toast.error('Failed to fetch train details');
    } finally {
      setLoadingState(false);
    }
  };

  const handleManualModalSubmit = async (e) => {
    e.preventDefault();
    const { trainNumber, journeyDate, coach, seat } = manual;
    if (!trainNumber || !journeyDate || !coach || !seat) {
      toast.error('Fill all journey fields');
      return;
    }
    if (!manualTrainDetails) {
      toast.error('Fetch and confirm train details before joining');
      return;
    }
    if (!manualTrainConfirmed) {
      toast.error('Confirm the fetched train details before joining');
      return;
    }

    setLoading(true);
    try {
      const journey = {
        trainNumber,
        trainName: manualTrainDetails?.train_name || '',
        journeyDate,
        coach,
        seat,
      };
      const joinData = await joinBackgroundGroup({
        trainNumber,
        journeyDate,
        coach,
        berth: seat,
        arrivalTime: manualTrainDetails?.arrival || null,
      });
      toast.success('Joined your train group.');
      setManualTrainDetails(null);
      setManualTrainConfirmed(false);
      setShowManualModal(false);
      await handleJoinSuccess(journey, joinData?.coach_id);
    } catch (err) {
      if (err.message !== 'validation' && err.message !== 'join_failed') {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGeneralModalSubmit = async (e) => {
    e.preventDefault();
    const { trainNumber, journeyDate } = general;
    if (!trainNumber || !journeyDate) {
      toast.error('Fill train number and journey date');
      return;
    }
    if (!generalTrainDetails) {
      toast.error('Fetch and confirm train details before joining');
      return;
    }
    if (!generalTrainConfirmed) {
      toast.error('Confirm the fetched train details before joining');
      return;
    }

    setLoading(true);
    try {
      const journey = {
        trainNumber,
        trainName: generalTrainDetails?.train_name || '',
        journeyDate,
        coach: 'general',
        berth: '',
        seat: '',
      };
      const joinData = await joinBackgroundGroup({
        trainNumber,
        journeyDate,
        coach: 'general',
        arrivalTime: generalTrainDetails?.arrival || null,
      });
      toast.success('Joined the train group.');
      setGeneralTrainDetails(null);
      setGeneralTrainConfirmed(false);
      setShowGeneralModal(false);
      await handleJoinSuccess(journey, joinData?.coach_id);
    } catch (err) {
      if (err.message !== 'validation' && err.message !== 'join_failed') {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePnrSubmit = async (e) => {
    e.preventDefault();
    if (!/^[0-9]{10}$/.test(pnr)) {
      toast.error('PNR must be exactly 10 digits');
      return;
    }

    setPnrFetching(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/pnr/${pnr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Invalid PNR');
        setPnrFetching(false);
        return;
      }

      const data = await res.json();
      setPnrDetails(data);
      setSelectedBerth('');
      const pnrDate = data.journey_date ? new Date(data.journey_date.split('-').reverse().join('-')) : new Date();
      setPnrJourneyDate(formatDate(pnrDate));
    } catch (err) {
      toast.error('Failed to fetch PNR details');
    } finally {
      setPnrFetching(false);
    }
  };

  const handlePnrJoin = async (e) => {
    e.preventDefault();
    if (!selectedBerth) {
      toast.error('Please select a berth');
      return;
    }

    setLoading(true);
    try {
      const journey = {
        trainNumber: pnrDetails.train_number,
        trainName: pnrDetails.train_name || '',
        journeyDate: pnrJourneyDate,
        coach: pnrDetails.coach || 'general',
        seat: selectedBerth,
      };

      const joinData = await joinBackgroundGroup({
        trainNumber: journey.trainNumber,
        journeyDate: journey.journeyDate,
        coach: journey.coach,
        berth: journey.seat,
        arrivalTime: pnrDetails?.arrival || null,
      });

      toast.success('PNR matched and train group joined.');
      setPnr('');
      setPnrDetails(null);
      setShowPnrModal(false);
      await handleJoinSuccess(journey, joinData?.coach_id);
    } catch (err) {
      if (err.message !== 'validation' && err.message !== 'join_failed') {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const closePnrModal = () => {
    setShowPnrModal(false);
    setPnr('');
    setPnrDetails(null);
    setSelectedBerth('');
  };

  const closeManualModal = () => {
    setShowManualModal(false);
    setManualTrainDetails(null);
    setManualTrainConfirmed(false);
  };

  const closeGeneralModal = () => {
    setShowGeneralModal(false);
    setGeneralTrainDetails(null);
    setGeneralTrainConfirmed(false);
  };

  const quickCards = [
    {
      title: 'Board With PNR',
      desc: 'Fetch train, berth, and seat context in one step.',
      icon: <Ticket size={28} color="var(--accent)" />,
      action: () => setShowPnrModal(true),
      accent: 'var(--accent)',
      bg: 'linear-gradient(135deg, rgba(0,229,192,0.14), rgba(59,139,255,0.12))',
    },
    {
      title: 'Manual Coach Entry',
      desc: 'Useful when you know your train, coach, and berth already.',
      icon: <PenSquare size={28} color="var(--rail-gold)" />,
      action: () => setShowManualModal(true),
      accent: 'var(--rail-gold)',
      bg: 'linear-gradient(135deg, rgba(247,198,106,0.14), rgba(216,123,74,0.12))',
    },
    {
      title: 'General Passenger Entry',
      desc: 'Join the train-wide conversation without berth details.',
      icon: <Users size={28} color="var(--accent2)" />,
      action: () => setShowGeneralModal(true),
      accent: 'var(--accent2)',
      bg: 'linear-gradient(135deg, rgba(59,139,255,0.14), rgba(16,217,138,0.10))',
    },
  ];

  return (
    <div className="page-shell">
      <div className="container section-stack">
        <div className="rail-shell" style={{ padding: 'clamp(1.15rem, 3vw, 2rem)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 720 }}>
              <div className="route-pill" style={{ marginBottom: '1rem' }}>
                <TrainFront size={14} />
                Traveler Dashboard
              </div>
              <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', marginBottom: '0.8rem' }}>
                Build your train context before the train even settles.
              </h1>
              <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 620 }}>
                Choose the way you want to board into JourneyGuard. We can use your PNR, your coach details,
                or just your train number if you are traveling without a fixed berth.
              </p>
            </div>

            <div className="ticket-card" style={{ padding: '1.2rem 1.3rem', minWidth: 0, width: '100%', maxWidth: 360, alignSelf: 'flex-start' }}>
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                Traveler Snapshot
              </div>
              <h3 style={{ fontSize: '1.35rem', margin: '0.45rem 0 0.9rem' }}>{user?.email}</h3>
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Today</span>
                  <strong>{new Date().toLocaleDateString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Journey loaded</span>
                  <strong>{currentJourney ? 'Yes' : 'No'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Quick access</span>
                  <strong>Group, settings, support</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {currentJourney && (
          <div className="ticket-card" style={{ padding: 'clamp(1.1rem, 3vw, 1.6rem)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                  Active Boarding Pass
                </div>
                <h2 style={{ fontSize: '1.9rem', marginTop: '0.4rem' }}>
                  {formatTrainGroupName(currentJourney.trainName, currentJourney.trainNumber)}
                </h2>
              </div>
              <div className="route-pill" style={{ background: 'rgba(32,50,79,0.08)', borderColor: 'rgba(32,50,79,0.12)', color: '#20324f' }}>
                Ready for train chat
              </div>
            </div>

            <div className="dashboard-grid" style={{ marginBottom: '1rem' }}>
              <div><strong>Date</strong><div>{currentJourney.journeyDate}</div></div>
              <div><strong>Coach</strong><div>{currentJourney.coach || 'general'}</div></div>
              <div><strong>Seat</strong><div>{currentJourney.seat || '-'}</div></div>
              <div><strong>Next step</strong><div>Open your group</div></div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => navigate(getGroupPath(currentJourney))} className="btn btn-primary">
                Open Train Group
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setShowManualModal(true)} className="btn btn-secondary">Adjust Journey</button>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          {quickCards.map((card) => (
            <button
              key={card.title}
              onClick={card.action}
              style={{
                textAlign: 'left',
                padding: '1.5rem',
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.08)',
                background: card.bg,
                color: 'var(--text)',
                cursor: 'pointer',
                transition: 'transform 0.2s ease, border-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.2rem' }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(8,13,26,0.22)',
                  }}
                >
                  {card.icon}
                </div>
                <ArrowRight size={18} color={card.accent} />
              </div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.45rem' }}>{card.title}</h3>
              <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{card.desc}</p>
            </button>
          ))}
        </div>

        <div className="dashboard-grid">
          <div className="card" style={{ padding: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.8rem' }}>
              <MapPinned size={18} color="var(--rail-gold)" />
              <h3 style={{ margin: 0 }}>Trip flow</h3>
            </div>
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {[
                'Choose how to join your train context',
                'Confirm berth or coach details',
                'Enter your train group and coordinate across coaches',
                'Use settings and support pages when needed',
              ].map((step) => (
                <div key={step} style={{ display: 'flex', gap: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <ArrowRight size={15} color="var(--accent)" style={{ marginTop: 4, flexShrink: 0 }} />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.8rem' }}>
              <CalendarDays size={18} color="var(--accent2)" />
              <h3 style={{ margin: 0 }}>Quick links</h3>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/group" className="btn btn-secondary btn-sm">My Group</Link>
              <Link to="/settings" className="btn btn-secondary btn-sm">Settings</Link>
              <Link to="/contact" className="btn btn-secondary btn-sm">Support</Link>
            </div>
          </div>
        </div>
      </div>

      {showManualModal && (
        <JourneyModal title="Manual Coach Entry" subtitle="Fill in the train, coach, and berth you want to join." onClose={closeManualModal}>
          <form onSubmit={handleManualModalSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <input className="input" value={manual.trainNumber} onChange={(e) => setManual({ ...manual, trainNumber: e.target.value.toUpperCase() })} placeholder="Train number" required />
            <input className="input" type="date" value={manual.journeyDate} onChange={(e) => setManual({ ...manual, journeyDate: e.target.value })} required />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={manualTrainFetching}
              onClick={() => fetchTrainDetails({ trainNumber: manual.trainNumber, journeyDate: manual.journeyDate, mode: 'manual' })}
              style={{ justifyContent: 'center' }}
            >
              {manualTrainFetching ? <span className="spinner" /> : 'Get Train Details'}
            </button>
            {manualTrainDetails && (
              <TrainDetailsCard
                details={manualTrainDetails}
                confirmed={manualTrainConfirmed}
                onConfirm={() => setManualTrainConfirmed(true)}
                onCancel={() => {
                  setManualTrainDetails(null);
                  setManualTrainConfirmed(false);
                }}
              />
            )}
            <div className="manual-seat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input className="input" value={manual.coach} onChange={(e) => setManual({ ...manual, coach: e.target.value.toUpperCase() })} placeholder="Coach" required />
              <input className="input" value={manual.seat} onChange={(e) => setManual({ ...manual, seat: e.target.value.toUpperCase() })} placeholder="Seat" required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading || !manualTrainDetails || !manualTrainConfirmed} style={{ justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : 'Confirm and Join Train Group'}
            </button>
          </form>
        </JourneyModal>
      )}

      {showGeneralModal && (
        <JourneyModal title="General Passenger Entry" subtitle="Join the same train-wide group without coach or berth details." onClose={closeGeneralModal}>
          <form onSubmit={handleGeneralModalSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <input className="input" value={general.trainNumber} onChange={(e) => setGeneral({ ...general, trainNumber: e.target.value.toUpperCase() })} placeholder="Train number" required />
            <input className="input" type="date" value={general.journeyDate} onChange={(e) => setGeneral({ ...general, journeyDate: e.target.value })} required />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={generalTrainFetching}
              onClick={() => fetchTrainDetails({ trainNumber: general.trainNumber, journeyDate: general.journeyDate, mode: 'general' })}
              style={{ justifyContent: 'center' }}
            >
              {generalTrainFetching ? <span className="spinner" /> : 'Get Train Details'}
            </button>
            {generalTrainDetails && (
              <TrainDetailsCard
                details={generalTrainDetails}
                confirmed={generalTrainConfirmed}
                onConfirm={() => setGeneralTrainConfirmed(true)}
                onCancel={() => {
                  setGeneralTrainDetails(null);
                  setGeneralTrainConfirmed(false);
                }}
              />
            )}
            <button type="submit" className="btn btn-primary" disabled={loading || !generalTrainDetails || !generalTrainConfirmed} style={{ justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : 'Confirm and Join Train Group'}
            </button>
          </form>
        </JourneyModal>
      )}

      {showPnrModal && (
        <JourneyModal title="Board With PNR" subtitle="Fetch your train and choose the berth that belongs to you." onClose={closePnrModal}>
          {!pnrDetails ? (
            <form onSubmit={handlePnrSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <input
                className="input"
                value={pnr}
                onChange={(e) => setPnr(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit PNR"
                required
              />
              <button type="submit" className="btn btn-primary" disabled={pnrFetching || pnr.length !== 10} style={{ justifyContent: 'center' }}>
                {pnrFetching ? <span className="spinner" /> : 'Fetch Details'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePnrJoin} style={{ display: 'grid', gap: '1rem' }}>
              <div className="glass-card" style={{ padding: '1rem' }}>
                <div className="dashboard-grid">
                  <div><strong>Train</strong><div>{pnrDetails.train_number}</div></div>
                  <div><strong>Coach</strong><div>{pnrDetails.coach || 'General'}</div></div>
                  <div><strong>From</strong><div>{pnrDetails.from_station}</div></div>
                  <div><strong>To</strong><div>{pnrDetails.to_station}</div></div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: 600 }}>Select berth</label>
                <div className="dashboard-grid">
                  {(pnrDetails.all_berths || []).map((berth) => (
                    <button
                      key={berth.berth_number}
                      type="button"
                      onClick={() => setSelectedBerth(berth.berth_number)}
                      style={{
                        padding: '0.9rem',
                        borderRadius: 16,
                        border: selectedBerth === berth.berth_number ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: selectedBerth === berth.berth_number ? 'rgba(0,229,192,0.12)' : 'var(--surface2)',
                        color: 'var(--text)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>Berth {berth.berth_number}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>{berth.passenger_name}</div>
                    </button>
                  ))}
                </div>
              </div>

              <input className="input" type="date" value={pnrJourneyDate} onChange={(e) => setPnrJourneyDate(e.target.value)} required />

              <button type="submit" className="btn btn-primary" disabled={loading || !selectedBerth} style={{ justifyContent: 'center' }}>
                {loading ? <span className="spinner" /> : 'Join From PNR'}
              </button>
            </form>
          )}
        </JourneyModal>
      )}
    </div>
  );
}

function JourneyModal({ title, subtitle, children, onClose }) {
  return (
    <div
      className="journey-modal-shell"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6,10,18,0.7)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 1000,
      }}
    >
      <div className="card modal-card journey-modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.2rem' }}>
          <div>
            <h2 style={{ marginBottom: '0.35rem' }}>{title}</h2>
            <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{subtitle}</p>
          </div>
          {onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}>
              <X size={22} />
            </button>
          )}
        </div>
        {children}
      </div>
      <style>{`
        @media (max-width: 768px) {
          .journey-modal-shell {
            align-items: flex-end !important;
            padding: 0.5rem !important;
          }

          .journey-modal-card {
            border-bottom-left-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            max-height: 88vh !important;
          }

          .manual-seat-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function TrainDetailsCard({ details, confirmed, onConfirm, onCancel }) {
  return (
    <div className="glass-card" style={{ padding: '1rem', display: 'grid', gap: '0.9rem' }}>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Train found</div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
          {details.train_number} {details.train_name ? `- ${details.train_name}` : ''}
        </div>
      </div>
      <div className="dashboard-grid">
        <div><strong>Start</strong><div>{details.from_station || '-'}</div></div>
        <div><strong>End</strong><div>{details.to_station || '-'}</div></div>
        <div><strong>Departure</strong><div>{details.departure || '-'}</div></div>
        <div><strong>Arrival</strong><div>{details.arrival || '-'}</div></div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          {confirmed ? 'Details Confirmed' : 'Confirm Details'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
