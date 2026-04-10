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
    berthStatus: 'CONFIRMED',
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
  const [pnrLookupError, setPnrLookupError] = useState('');
  const [pnrFetching, setPnrFetching] = useState(false);
  const [selectedBerth, setSelectedBerth] = useState('');
  const [pnrFallback, setPnrFallback] = useState({
    trainNumber: '',
    journeyDate: formatDate(new Date()),
    coach: '',
    seat: '',
    berthStatus: 'CONFIRMED',
  });
  const [manualTrainDetails, setManualTrainDetails] = useState(null);
  const [generalTrainDetails, setGeneralTrainDetails] = useState(null);
  const [manualTrainFetching, setManualTrainFetching] = useState(false);
  const [generalTrainFetching, setGeneralTrainFetching] = useState(false);
  const [manualTrainConfirmed, setManualTrainConfirmed] = useState(false);
  const [generalTrainConfirmed, setGeneralTrainConfirmed] = useState(false);
  const [manualSelectedRunDate, setManualSelectedRunDate] = useState('');
  const [generalSelectedRunDate, setGeneralSelectedRunDate] = useState('');

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
        berthStatus: journey.berthStatus || prev.berthStatus,
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
          displayName: serverJourney.display_name || storedJourney.displayName || '',
          journeyDate: serverJourney.journey_date,
          coach: serverJourney.coach || 'general',
          seat: serverJourney.berth || serverJourney.seat || '',
          berthStatus: serverJourney.berth_status || storedJourney.berthStatus || '',
          joinMode: serverJourney.join_mode || storedJourney.joinMode || '',
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
    setManualSelectedRunDate('');
  }, [manual.trainNumber, manual.journeyDate]);

  useEffect(() => {
    setGeneralTrainDetails(null);
    setGeneralTrainConfirmed(false);
    setGeneralSelectedRunDate('');
  }, [general.trainNumber, general.journeyDate]);

  const getGroupPath = (journey, coachId) => {
    const groupId = `${journey.trainNumber}_${journey.journeyDate}`;
    const coachKey = coachId || TRAIN_GROUP_CHANNEL_ID;
    return `/group/${groupId}/${coachKey}`;
  };

  const joinBackgroundGroup = async ({
    trainNumber,
    journeyDate,
    runDate = null,
    coach = 'general',
    berth = '',
    arrivalTime = null,
    berthStatus = null,
    joinMode = null,
  }) => {
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
        run_date: runDate || journeyDate,
        coach,
        berth,
        arrival_time: arrivalTime,
        berth_status: berthStatus,
        join_mode: joinMode,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || 'Could not join train group';
      const error = new Error(message);
      error.code = detail?.code || err?.code || 'join_failed';
      error.status = res.status;
      error.detail = detail;
      throw error;
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
      if (mode === 'manual') {
        setManualSelectedRunDate(data.requires_run_date_selection ? '' : (data.run_date || journeyDate));
      }
      if (mode === 'general') {
        setGeneralSelectedRunDate(data.requires_run_date_selection ? '' : (data.run_date || journeyDate));
      }
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
    const { trainNumber, journeyDate, coach, seat, berthStatus } = manual;
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
    if (manualTrainDetails?.requires_run_date_selection && !manualSelectedRunDate) {
      toast.error('Choose whether you want yesterday or today train run');
      return;
    }

    setLoading(true);
    try {
      const resolvedRunDate = manualSelectedRunDate || manualTrainDetails?.run_date || journeyDate;
      const journey = {
        trainNumber,
        trainName: manualTrainDetails?.train_name || '',
        displayName: '',
        journeyDate: resolvedRunDate,
        coach,
        seat,
        berthStatus,
        joinMode: 'manual',
      };
      const joinData = await joinBackgroundGroup({
        trainNumber,
        journeyDate,
        runDate: resolvedRunDate,
        coach,
        berth: seat,
        arrivalTime: manualTrainDetails?.arrival || null,
        berthStatus,
        joinMode: 'manual',
      });
      journey.journeyDate = joinData?.journey_date || journey.journeyDate;
      journey.displayName = joinData?.display_name || '';
      toast.success('Joined your train group.');
      setManualTrainDetails(null);
      setManualTrainConfirmed(false);
      setShowManualModal(false);
      await handleJoinSuccess(journey, joinData?.coach_id);
    } catch (err) {
      if (err.code === 'manual_seat_conflict') {
        const shouldSwitchToRac = window.confirm(
          'This coach and seat already exist for another passenger. Click OK if this is an RAC ticket and we will switch this manual entry to RAC. Click Cancel to recheck the details.'
        );
        if (shouldSwitchToRac) {
          setManual((prev) => ({ ...prev, berthStatus: 'RAC' }));
          toast('Manual entry switched to RAC. Submit once more to join.');
        }
      } else if (err.message !== 'validation' && err.message !== 'join_failed') {
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
    if (generalTrainDetails?.requires_run_date_selection && !generalSelectedRunDate) {
      toast.error('Choose whether you want yesterday or today train run');
      return;
    }

    setLoading(true);
    try {
      const resolvedRunDate = generalSelectedRunDate || generalTrainDetails?.run_date || journeyDate;
      const journey = {
        trainNumber,
        trainName: generalTrainDetails?.train_name || '',
        displayName: '',
        journeyDate: resolvedRunDate,
        coach: 'general',
        berth: '',
        seat: '',
        berthStatus: '',
        joinMode: 'general',
      };
      const joinData = await joinBackgroundGroup({
        trainNumber,
        journeyDate,
        runDate: resolvedRunDate,
        coach: 'general',
        arrivalTime: generalTrainDetails?.arrival || null,
        joinMode: 'general',
      });
      journey.journeyDate = joinData?.journey_date || journey.journeyDate;
      journey.displayName = joinData?.display_name || '';
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
    setPnrLookupError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/pnr/${pnr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = typeof err.detail === 'string' ? err.detail : 'Could not fetch PNR details';
        setPnrLookupError(detail);
        toast.error(detail);
        setPnrFetching(false);
        return;
      }

      const data = await res.json();
      const resolvedBerth = data.selected_berth
        || data.berth
        || (Array.isArray(data.available_berths) && data.available_berths.length === 1 ? data.available_berths[0] : '');
      setPnrDetails(data);
      setPnrLookupError('');
      setSelectedBerth(resolvedBerth);
      setPnrFallback((prev) => ({
        ...prev,
        trainNumber: data.train_number || prev.trainNumber,
        journeyDate: data.run_date || data.journey_date || prev.journeyDate,
        coach: data.coach || prev.coach,
        seat: data.berth || prev.seat,
      }));
      if (data.cancelled || String(data.current_status || '').toLowerCase().includes('cancel')) {
        toast.error(data.current_status || 'This train is cancelled. Joining is disabled.');
      }
    } catch (err) {
      setPnrLookupError('Failed to fetch PNR details');
      toast.error('Failed to fetch PNR details');
    } finally {
      setPnrFetching(false);
    }
  };

  const handlePnrFallbackJoin = async (e) => {
    e.preventDefault();
    if (!pnrFallback.trainNumber || !pnrFallback.journeyDate || !pnrFallback.coach || !pnrFallback.seat) {
      toast.error('Enter train number, train start date, coach, and berth');
      return;
    }

    setLoading(true);
    try {
      const journey = {
        trainNumber: pnrFallback.trainNumber,
        trainName: '',
        displayName: '',
        journeyDate: pnrFallback.journeyDate,
        coach: pnrFallback.coach,
        seat: pnrFallback.seat,
        berthStatus: pnrFallback.berthStatus,
        joinMode: 'pnr_fallback',
      };

      const joinData = await joinBackgroundGroup({
        trainNumber: journey.trainNumber,
        journeyDate: journey.journeyDate,
        runDate: journey.journeyDate,
        coach: journey.coach,
        berth: journey.seat,
        berthStatus: journey.berthStatus,
        joinMode: 'pnr_fallback',
      });

      journey.journeyDate = joinData?.journey_date || journey.journeyDate;
      journey.displayName = joinData?.display_name || '';

      toast.success('Joined the train group using manual PNR fallback.');
      setPnr('');
      setPnrDetails(null);
      setPnrLookupError('');
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

  const handlePnrJoin = async (e) => {
    e.preventDefault();
    if (pnrDetails?.cancelled || String(pnrDetails?.current_status || '').toLowerCase().includes('cancel')) {
      toast.error(pnrDetails?.current_status || 'This train is cancelled. Joining is not allowed.');
      return;
    }
    if (!selectedBerth) {
      toast.error('Please select a berth');
      return;
    }

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const claimRes = await fetch(`${API_BASE_URL}/pnr/${pnrDetails.pnr}/claim-berth`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          berth_number: selectedBerth,
        }),
      });

      if (!claimRes.ok) {
        const claimErr = await claimRes.json().catch(() => ({}));
        const detail = typeof claimErr?.detail === 'string' ? claimErr.detail : 'That seat is already taken. Please choose another one.';
        toast.error(detail);
        const refreshRes = await fetch(`${API_BASE_URL}/pnr/${pnrDetails.pnr}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          const resolvedBerth = refreshed.selected_berth
            || refreshed.berth
            || (Array.isArray(refreshed.available_berths) && refreshed.available_berths.length === 1 ? refreshed.available_berths[0] : '');
          setPnrDetails(refreshed);
          setSelectedBerth(resolvedBerth);
        }
        setLoading(false);
        return;
      }

      const claimData = await claimRes.json().catch(() => ({}));
      const journey = {
        trainNumber: pnrDetails.train_number,
        trainName: pnrDetails.train_name || '',
        displayName: '',
        journeyDate: claimData.run_date || pnrDetails.run_date || pnrDetails.journey_date,
        coach: pnrDetails.coach || 'general',
        seat: selectedBerth,
        berthStatus: '',
        joinMode: 'pnr',
        pnr: pnrDetails.pnr,
        pnrDate: claimData.journey_date || pnrDetails.journey_date,
      };

      const joinData = await joinBackgroundGroup({
        trainNumber: journey.trainNumber,
        journeyDate: claimData.journey_date || pnrDetails.journey_date || journey.journeyDate,
        runDate: claimData.run_date || pnrDetails.run_date || journey.journeyDate,
        coach: journey.coach,
        berth: journey.seat,
        arrivalTime: pnrDetails?.arrival || null,
        joinMode: 'pnr',
      });
      journey.journeyDate = joinData?.journey_date || journey.journeyDate;
      journey.displayName = joinData?.display_name || '';

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
    setPnrLookupError('');
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

  const pnrAllBerths = pnrDetails?.all_berths || [];
  const pnrAvailableBerths = pnrDetails?.available_berths || [];
  const resolvedPnrBerth = selectedBerth || pnrDetails?.selected_berth || pnrDetails?.berth || '';
  const hasParsedPnrBerths = pnrAllBerths.length > 0;
  const allPnrBerthsClaimed = hasParsedPnrBerths && !pnrDetails?.selected_berth && pnrAvailableBerths.length === 0;
  const pnrStatusText = String(pnrDetails?.current_status || '').trim();
  const pnrChartPending = /chart\s+not\s+prepared/i.test(pnrStatusText);
  const shouldShowPnrBerthSelector = !pnrDetails?.selected_berth && pnrAllBerths.length > 1 && pnrAvailableBerths.length > 1;

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

            <div className="ticket-card" style={{ padding: '1.2rem 1.4rem', minWidth: 0, width: '100%', maxWidth: 430, alignSelf: 'flex-start' }}>
              <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                Traveler Snapshot
              </div>
              <h3 style={{ fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', margin: '0.45rem 0 0.9rem', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{user?.email}</h3>
              <div style={{ display: 'grid', gap: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start' }}>
                  <span>Today</span>
                  <strong style={{ textAlign: 'right' }}>{new Date().toLocaleDateString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start' }}>
                  <span>Journey loaded</span>
                  <strong style={{ textAlign: 'right' }}>{currentJourney ? 'Yes' : 'No'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start' }}>
                  <span>Quick access</span>
                  <strong style={{ textAlign: 'right', maxWidth: 220, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>Group, settings, support</strong>
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
              <div><strong>Booking</strong><div>{currentJourney.berthStatus || '-'}</div></div>
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
        <JourneyModal title="Manual Coach Entry" subtitle="Fill in the train, coach, berth, and whether it is Confirmed or RAC." onClose={closeManualModal}>
          <form onSubmit={handleManualModalSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <input className="input" value={manual.trainNumber} onChange={(e) => setManual({ ...manual, trainNumber: e.target.value.toUpperCase() })} placeholder="Train number" required />
            <RelativeDatePicker
              value={manual.journeyDate}
              onChange={(value) => setManual({ ...manual, journeyDate: value })}
            />
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
                selectedRunDate={manualSelectedRunDate}
                onSelectRunDate={setManualSelectedRunDate}
                onConfirm={() => setManualTrainConfirmed(true)}
                onCancel={() => {
                  setManualTrainDetails(null);
                  setManualTrainConfirmed(false);
                  setManualSelectedRunDate('');
                }}
              />
            )}
            <div className="manual-seat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <input className="input" value={manual.coach} onChange={(e) => setManual({ ...manual, coach: e.target.value.toUpperCase() })} placeholder="Coach" required />
              <input className="input" value={manual.seat} onChange={(e) => setManual({ ...manual, seat: e.target.value.toUpperCase() })} placeholder="Seat" required />
            </div>
            <div className="glass-card" style={{ padding: '0.95rem' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '0.65rem' }}>Seat status</div>
              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                {[
                  ['CONFIRMED', 'Confirmed berth'],
                  ['RAC', 'RAC'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`action-chip ${manual.berthStatus === value ? 'active' : ''}`}
                    onClick={() => setManual({ ...manual, berthStatus: value })}
                    style={{
                      background: manual.berthStatus === value ? 'rgba(32,50,79,0.12)' : undefined,
                      color: manual.berthStatus === value ? '#20324f' : undefined,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
            <RelativeDatePicker
              value={general.journeyDate}
              onChange={(value) => setGeneral({ ...general, journeyDate: value })}
            />
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
                selectedRunDate={generalSelectedRunDate}
                onSelectRunDate={setGeneralSelectedRunDate}
                onConfirm={() => setGeneralTrainConfirmed(true)}
                onCancel={() => {
                  setGeneralTrainDetails(null);
                  setGeneralTrainConfirmed(false);
                  setGeneralSelectedRunDate('');
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
            <div style={{ display: 'grid', gap: '1rem' }}>
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

              {pnrLookupError && (
                <form onSubmit={handlePnrFallbackJoin} className="glass-card" style={{ padding: '1rem', display: 'grid', gap: '0.9rem' }}>
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <div style={{ fontWeight: 700 }}>PNR details unavailable from API</div>
                    <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                      {pnrLookupError}. You can still join the train group by entering the ticket details manually.
                    </div>
                  </div>
                  <input
                    className="input"
                    value={pnrFallback.trainNumber}
                    onChange={(e) => setPnrFallback((prev) => ({ ...prev, trainNumber: e.target.value.toUpperCase() }))}
                    placeholder="Train number"
                    required
                  />
                  <RelativeDatePicker
                    value={pnrFallback.journeyDate}
                    onChange={(value) => setPnrFallback((prev) => ({ ...prev, journeyDate: value }))}
                  />
                  <div className="manual-seat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <input
                      className="input"
                      value={pnrFallback.coach}
                      onChange={(e) => setPnrFallback((prev) => ({ ...prev, coach: e.target.value.toUpperCase() }))}
                      placeholder="Coach"
                      required
                    />
                    <input
                      className="input"
                      value={pnrFallback.seat}
                      onChange={(e) => setPnrFallback((prev) => ({ ...prev, seat: e.target.value.toUpperCase() }))}
                      placeholder="Berth / Seat"
                      required
                    />
                  </div>
                  <div className="glass-card" style={{ padding: '0.95rem' }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '0.65rem' }}>Seat status</div>
                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                      {[
                        ['CONFIRMED', 'Confirmed berth'],
                        ['RAC', 'RAC'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`action-chip ${pnrFallback.berthStatus === value ? 'active' : ''}`}
                          onClick={() => setPnrFallback((prev) => ({ ...prev, berthStatus: value }))}
                          style={{
                            background: pnrFallback.berthStatus === value ? 'rgba(32,50,79,0.12)' : undefined,
                            color: pnrFallback.berthStatus === value ? '#20324f' : undefined,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="submit" className="btn btn-secondary" disabled={loading} style={{ justifyContent: 'center' }}>
                    {loading ? <span className="spinner" /> : 'Join With Manual Ticket Details'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form onSubmit={handlePnrJoin} style={{ display: 'grid', gap: '1rem' }}>
              <div className="glass-card" style={{ padding: '1rem' }}>
                <div className="dashboard-grid">
                  <div><strong>Train</strong><div>{pnrDetails.train_number} {pnrDetails.train_name ? `- ${pnrDetails.train_name}` : ''}</div></div>
                  <div><strong>Coach</strong><div>{pnrDetails.coach || 'General'}</div></div>
                  <div><strong>From</strong><div>{pnrDetails.from_station}</div></div>
                  <div><strong>To</strong><div>{pnrDetails.to_station}</div></div>
                  <div><strong>Journey date</strong><div>{describeRunDate(pnrDetails.journey_date || '')}</div></div>
                  <div><strong>Run date</strong><div>{describeRunDate(pnrDetails.run_date || pnrDetails.journey_date || '')}</div></div>
                </div>
              </div>

              <div>
                {shouldShowPnrBerthSelector ? (
                  <>
                    <label style={{ display: 'block', marginBottom: '0.6rem', fontWeight: 600 }}>Select berth</label>
                    <div style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: '0.8rem' }}>
                      If this PNR has multiple passengers, choose your own seat number. Already selected seats are hidden for other users.
                    </div>
                    {allPnrBerthsClaimed && (
                      <div className="glass-card" style={{ padding: '0.95rem', marginBottom: '0.8rem', color: 'var(--danger)', background: 'rgba(223,79,104,0.08)' }}>
                        All seats from this PNR have already been selected by other users.
                      </div>
                    )}
                    <div className="dashboard-grid">
                      {pnrAllBerths.map((berth) => (
                        (() => {
                          const isAvailable = pnrAvailableBerths.includes(berth.berth_number);
                          const isSelected = selectedBerth === berth.berth_number;
                          const isMine = pnrDetails.selected_berth === berth.berth_number;
                          return (
                            <button
                              key={berth.berth_number}
                              type="button"
                              onClick={() => isAvailable && setSelectedBerth(berth.berth_number)}
                              disabled={!isAvailable}
                              style={{
                                padding: '0.9rem',
                                borderRadius: 16,
                                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                                background: isSelected
                                  ? 'rgba(0,229,192,0.12)'
                                  : isAvailable
                                    ? 'var(--surface2)'
                                    : 'rgba(223,79,104,0.08)',
                                color: isAvailable ? 'var(--text)' : 'var(--text2)',
                                textAlign: 'left',
                                cursor: isAvailable ? 'pointer' : 'not-allowed',
                                opacity: isAvailable ? 1 : 0.7,
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>Berth {berth.berth_number}</div>
                              <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>{berth.passenger_name}</div>
                              <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: isMine ? 'var(--success)' : (!isAvailable ? 'var(--danger)' : 'var(--text2)') }}>
                                {isMine ? 'Already selected by you' : (!isAvailable ? 'Already selected' : 'Available')}
                              </div>
                            </button>
                          );
                        })()
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="glass-card" style={{ padding: '0.95rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Berth confirmed</div>
                    <div style={{ color: 'var(--text2)', fontSize: '0.92rem' }}>
                      {resolvedPnrBerth
                        ? `Using berth ${resolvedPnrBerth} from your PNR details.`
                        : allPnrBerthsClaimed
                          ? 'All seats from this PNR have already been selected by other users.'
                          : !hasParsedPnrBerths && pnrChartPending
                            ? 'Berth details are not available yet because the chart is not prepared.'
                            : !hasParsedPnrBerths
                              ? 'Berth details are not available from this PNR response yet.'
                          : 'No alternate berth selection is needed for this PNR.'}
                    </div>
                  </div>
                )}
              </div>
              {pnrDetails.cancelled && (
                <div className="glass-card" style={{ padding: '0.95rem', color: 'var(--danger)', background: 'rgba(223,79,104,0.08)' }}>
                  This train is currently cancelled, so joining this train group is disabled.
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={loading || !selectedBerth || pnrDetails.cancelled} style={{ justifyContent: 'center' }}>
                {loading ? <span className="spinner" /> : (pnrDetails.cancelled ? 'Join Disabled For Cancelled Train' : 'Join From PNR')}
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

function RelativeDatePicker({ value, onChange }) {
  const today = formatDate(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatDate(yesterdayDate);
  const dayBeforeYesterdayDate = new Date();
  dayBeforeYesterdayDate.setDate(dayBeforeYesterdayDate.getDate() - 2);
  const dayBeforeYesterday = formatDate(dayBeforeYesterdayDate);
  const [showChoices, setShowChoices] = useState(false);

  const dateOptions = [
    ['Today', today],
    ['Yesterday', yesterday],
    ['Day before yesterday', dayBeforeYesterday],
  ];

  const selectedOption = dateOptions.find(([, dateValue]) => dateValue === value);
  const selectedLabel = selectedOption?.[0] || value;
  const selectedDisplay = selectedOption ? `${selectedOption[0]} (${selectedOption[1]})` : value;

  return (
    <div className="glass-card" style={{ padding: '0.95rem', display: 'grid', gap: '0.7rem' }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>Train start date</div>
      <button
        type="button"
        className="action-chip"
        onClick={() => setShowChoices((open) => !open)}
        style={{ justifyContent: 'space-between', width: 'fit-content', minWidth: 220 }}
      >
        <span>{selectedLabel || 'Choose train start date'}</span>
        <CalendarDays size={16} />
      </button>
      {showChoices && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(6,10,18,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1100,
          }}
          onClick={() => setShowChoices(false)}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(420px, 100%)',
              padding: '0.9rem',
              display: 'grid',
              gap: '0.55rem',
              background: 'rgba(255,255,255,0.98)',
              border: '1px solid rgba(32,50,79,0.1)',
              boxShadow: '0 16px 40px rgba(18, 27, 45, 0.16)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>Choose train start date</div>
            {dateOptions.map(([label, dateValue]) => (
              <button
                key={dateValue}
                type="button"
                onClick={() => {
                  onChange(dateValue);
                  setShowChoices(false);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.8rem 0.9rem',
                  borderRadius: 14,
                  border: '1px solid rgba(32,50,79,0.08)',
                  background: value === dateValue ? 'rgba(32,50,79,0.08)' : 'rgba(255,255,255,0.92)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ color: 'var(--text2)', fontSize: '0.92rem' }}>{dateValue}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
        Selected train start date: <strong style={{ color: 'var(--text)' }}>{selectedDisplay}</strong>
      </div>
    </div>
  );
}

function TrainDetailsCard({ details, confirmed, selectedRunDate, onSelectRunDate, onConfirm, onCancel }) {
  const statusTone = details.cancelled
    ? { color: 'var(--danger)', bg: 'rgba(223,79,104,0.12)' }
    : details.route_changed
      ? { color: 'var(--rail-gold)', bg: 'rgba(247,198,106,0.16)' }
      : { color: 'var(--success)', bg: 'rgba(31,157,114,0.12)' };
  const routeView = buildRouteView(details);
  const canConfirm = !details.requires_run_date_selection || Boolean(selectedRunDate);
  const runDateDisplay = details.requires_run_date_selection
    ? (selectedRunDate ? renderRunChoiceLabel(selectedRunDate, 0) : 'Choose Yesterday or Today')
    : describeRunDate(details.run_date || details.journey_date || '');

  return (
    <div className="glass-card" style={{ padding: '1rem', display: 'grid', gap: '0.9rem' }}>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Train found</div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
          {details.train_number} {details.train_name ? `- ${details.train_name}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
        <span
          className="action-chip"
          style={{ cursor: 'default', color: statusTone.color, background: statusTone.bg, borderColor: 'transparent' }}
        >
          Status: {details.current_status || 'Scheduled'}
        </span>
        {details.current_station && (
          <span className="action-chip" style={{ cursor: 'default' }}>
            Current: {details.current_station}
          </span>
        )}
        {details.next_station_name && (
          <span className="action-chip" style={{ cursor: 'default' }}>
            Next: {details.next_station_name}
          </span>
        )}
      </div>
      <div className="dashboard-grid">
        <div><strong>Start</strong><div>{details.from_station || '-'}</div></div>
        <div><strong>End</strong><div>{details.to_station || '-'}</div></div>
        <div><strong>Departure</strong><div>{details.departure || '-'}</div></div>
        <div><strong>Arrival</strong><div>{details.arrival || '-'}</div></div>
        <div><strong>Expected arrival</strong><div>{details.expected_arrival || details.arrival || '-'}</div></div>
        <div><strong>Run date</strong><div>{runDateDisplay || '-'}</div></div>
      </div>
      {details.api_message && (
        <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
          {details.api_message}
        </div>
      )}
      {details.requires_run_date_selection && Array.isArray(details.run_date_options) && details.run_date_options.length > 1 && (
        <div className="glass-card" style={{ padding: '0.95rem', display: 'grid', gap: '0.7rem', background: 'rgba(247,198,106,0.1)' }}>
          <div style={{ fontWeight: 700 }}>Two train runs may exist for this train number.</div>
          <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
            Choose the running train you want to join. We will use the matching backend run date to create or join the correct train group.
          </div>
          <div style={{ color: 'var(--text2)', lineHeight: 1.7, fontSize: '0.92rem' }}>
            Yesterday means the train that started on the previous day and may still be running now. Today means the new train run that started today.
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {details.run_date_options.slice(0, 2).map((dateValue, index) => (
              <button
                key={dateValue}
                type="button"
                className="action-chip"
                onClick={() => onSelectRunDate?.(dateValue)}
                style={{
                  background: selectedRunDate === dateValue ? 'rgba(32,50,79,0.12)' : undefined,
                  color: selectedRunDate === dateValue ? '#20324f' : undefined,
                }}
              >
                {renderRunChoiceLabel(dateValue, index)}
              </button>
            ))}
          </div>
          {selectedRunDate && (
            <div style={{ color: 'var(--text2)', lineHeight: 1.7, fontSize: '0.9rem' }}>
              Selected train run: <strong style={{ color: 'var(--text)' }}>{renderRunChoiceLabel(selectedRunDate, 0)}</strong>
            </div>
          )}
        </div>
      )}
      {routeView && (
        <div className="glass-card" style={{ padding: '0.95rem', display: 'grid', gap: '0.8rem', background: 'rgba(8,13,26,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 4 }}>Start station</div>
              <div style={{ fontWeight: 700 }}>{routeView.start.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 4 }}>End station</div>
              <div style={{ fontWeight: 700 }}>{routeView.end.name}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {routeView.crossed.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Crossed stations</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {routeView.crossed.map((station) => (
                    <span key={`crossed-${station.index}`} className="action-chip" style={{ cursor: 'default', background: 'rgba(31,157,114,0.1)', color: 'var(--success)', borderColor: 'transparent' }}>
                      {station.code || station.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Current position</div>
              <div className="action-chip" style={{ cursor: 'default', width: 'fit-content', background: 'rgba(59,139,255,0.12)', color: 'var(--accent2)', borderColor: 'transparent' }}>
                {routeView.currentLabel}
              </div>
            </div>

            {routeView.upcoming.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Upcoming stations</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {routeView.upcoming.map((station) => (
                    <span key={`upcoming-${station.index}`} className="action-chip" style={{ cursor: 'default', background: 'rgba(247,198,106,0.16)', color: '#8a5a00', borderColor: 'transparent' }}>
                      {station.code || station.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!canConfirm}>
          {confirmed ? 'Details Confirmed' : 'Confirm Details'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function describeRunDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown date';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const parsed = new Date(`${raw}T00:00:00`);

  const isSameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const relative = isSameDay(parsed, today)
    ? 'Today'
    : isSameDay(parsed, yesterday)
      ? 'Yesterday'
      : null;

  return relative ? `${relative} (${raw})` : raw;
}

function renderRunChoiceLabel(value, index) {
  const raw = String(value || '').trim();
  const description = describeRunDate(raw);

  if (description.startsWith('Yesterday')) {
    return 'Yesterday';
  }
  if (description.startsWith('Today')) {
    return 'Today';
  }

  return index === 0 ? 'Yesterday' : 'Today';
}

function buildRouteView(details) {
  const stations = Array.isArray(details?.route_stations) ? details.route_stations.filter(Boolean) : [];
  if (!stations.length) return null;

  const normalize = (value) => String(value || '').trim().toUpperCase();
  const currentName = normalize(details.current_station);
  const nextName = normalize(details.next_station_name);

  const findIndex = (target) => {
    if (!target) return -1;
    return stations.findIndex((station) => {
      const name = normalize(station.name);
      const code = normalize(station.code);
      return name === target || code === target || name.includes(target) || target.includes(name) || code === target;
    });
  };

  const currentIndex = findIndex(currentName);
  const nextIndex = findIndex(nextName);
  const pivotIndex = currentIndex >= 0 ? currentIndex : nextIndex >= 0 ? Math.max(0, nextIndex - 1) : 0;

  return {
    start: stations[0],
    end: stations[stations.length - 1],
    crossed: stations.slice(Math.max(0, pivotIndex - 3), pivotIndex),
    upcoming: stations.slice(
      currentIndex >= 0 ? currentIndex + 1 : nextIndex >= 0 ? nextIndex : 1,
      currentIndex >= 0 ? currentIndex + 4 : nextIndex >= 0 ? nextIndex + 3 : 4
    ),
    currentLabel: details.current_station || details.next_station_name || stations[pivotIndex]?.name || 'Route loaded',
  };
}
