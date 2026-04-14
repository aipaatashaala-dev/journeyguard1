import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  PenSquare,
  ArrowLeft,
  Send,
  Trash2,
  Heart,
  UtensilsCrossed,
  BedDouble,
  MessageSquare,
  CheckCircle2,
  Users,
  MapPin,
  Copy,
  ExternalLink,
  TrainFront,
  Flag,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  getCurrentJourneyCompat,
  getJourneyGroup,
  getRequests,
  sendRequest,
  startLocationTracking,
  stopLocationTracking,
  updateLocation,
  deleteRequest,
  updateRequest,
  reportRequest,
} from '../utils/api';
import { API_BASE_URL } from '../utils/config';
import { saveDisplayName as persistDisplayName } from '../utils/displayName';
import {
  DEFAULT_GEOLOCATION_OPTIONS,
  getGeolocationErrorMessage,
  getGeolocationUnavailableMessage,
  requestGeolocationPermission,
} from '../utils/geolocation';
import { formatTrainGroupName } from '../utils/groupNames';
import { resolveTrackingLink } from '../utils/locationLinks';
import './GroupPage.css';

const REQ_TYPES = [
  { id: 'MEDICAL', label: 'Medical emergency', icon: <Heart size={14} />, color: 'var(--danger)' },
  { id: 'FOOD_NEED', label: 'Need food', icon: <UtensilsCrossed size={14} />, color: 'var(--accent3)' },
  { id: 'FOOD_HAS', label: 'Can share food', icon: <UtensilsCrossed size={14} />, color: 'var(--success)' },
  { id: 'BERTH', label: 'Berth exchange', icon: <BedDouble size={14} />, color: 'var(--accent2)' },
  { id: 'LOCATION', label: 'Live location', icon: <MapPin size={14} />, color: 'var(--accent)' },
  { id: 'SYSTEM', label: 'Journey update', icon: <TrainFront size={14} />, color: '#3657c8' },
  { id: 'CHAT', label: 'Message', icon: <MessageSquare size={14} />, color: 'var(--text2)' },
];
const MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000;

export default function GroupPage() {
  const { journeyId, coachId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [passengers, setPassengers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedReq, setSelectedReq] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState('');
  const [editingMessageText, setEditingMessageText] = useState('');
  const [savingMessageEdit, setSavingMessageEdit] = useState(false);
  const [sending, setSending] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationLink, setLocationLink] = useState('');
  const [locationMessageId, setLocationMessageId] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [trainInfo, setTrainInfo] = useState(null);
  const [editingIdentityName, setEditingIdentityName] = useState(false);
  const [identityNameDraft, setIdentityNameDraft] = useState('');
  const [identityNameSaving, setIdentityNameSaving] = useState(false);
  const lastMessageIdRef = useRef(null);
  const bottomRef = useRef(null);
  const watchRef = useRef(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastCoordsRef = useRef(null);

  const storedPassengerId = localStorage.getItem('jg_passenger_id');
  const journeyData = JSON.parse(localStorage.getItem('jg_journey') || '{}');
  const localDisplayName = String(journeyData?.displayName || '').trim();
  const myPassengerId = storedPassengerId || journeyData.passengerId || `Passenger-${user?.uid?.slice(-4) || 'guest'}`;
  const trainNumber = journeyId?.split('_')[0];
  const groupName = formatTrainGroupName(trainInfo?.train_name || journeyData?.trainName, trainNumber);
  const clearStoredJourney = () => {
    localStorage.removeItem('jg_journey');
    localStorage.removeItem('jg_group_id');
    localStorage.removeItem('jg_coach_id');
    localStorage.removeItem('jg_passenger_id');
    localStorage.removeItem('jg_journey_started');
  };
  const reqTypeMap = useMemo(
    () => Object.fromEntries(REQ_TYPES.map((item) => [item.id, item])),
    []
  );
  const passengerByUid = useMemo(() => {
    const map = {};
    passengers.forEach((p) => {
      if (p?.uid) map[p.uid] = p;
    });
    return map;
  }, [passengers]);
  const currentPassenger = useMemo(
    () => passengerByUid[user?.uid] || null,
    [passengerByUid, user?.uid]
  );
  const currentDisplayName = currentPassenger?.display_name || journeyData?.displayName || myPassengerId;
  const currentIdentityMeta = formatSenderMeta(
    currentPassenger?.coach || journeyData?.coach || 'general',
    currentPassenger?.berth || journeyData?.seat || journeyData?.berth || '',
    currentPassenger?.berth_status || journeyData?.berthStatus || ''
  );
  const racSeatPartner = useMemo(() => {
    const myCoach = String(journeyData?.coach || '').trim().toUpperCase();
    const mySeat = String(journeyData?.seat || journeyData?.berth || '').trim().toUpperCase();
    const myStatus = String(journeyData?.berthStatus || '').trim().toUpperCase();

    if (!user?.uid || myStatus !== 'RAC' || !myCoach || !mySeat) {
      return null;
    }

    return (
      passengers.find((passenger) =>
        passenger.uid !== user.uid &&
        String(passenger.coach || '').trim().toUpperCase() === myCoach &&
        String(passenger.berth || '').trim().toUpperCase() === mySeat &&
        String(passenger.berth_status || '').trim().toUpperCase() === 'RAC'
      ) || null
    );
  }, [journeyData?.berth, journeyData?.berthStatus, journeyData?.coach, journeyData?.seat, passengers, user?.uid]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!editingIdentityName) {
      setIdentityNameDraft(currentDisplayName || '');
    }
  }, [currentDisplayName, editingIdentityName]);

  useEffect(() => {
    const loadTrainInfo = async () => {
      if (!user || !trainNumber || !journeyData?.journeyDate) return;

      try {
        const token = await user.getIdToken();
        const query = new URLSearchParams({ journey_date: journeyData.journeyDate }).toString();
        const res = await fetch(`${API_BASE_URL}/journey/train-info/${encodeURIComponent(trainNumber)}?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setTrainInfo(data);
          const storedJourney = JSON.parse(localStorage.getItem('jg_journey') || '{}');
          if (data.train_name && storedJourney?.trainNumber && storedJourney?.journeyDate) {
            localStorage.setItem('jg_journey', JSON.stringify({
              ...storedJourney,
              trainName: data.train_name,
            }));
          }
        }
      } catch {
        // Keep the train chat usable even if train metadata fetch fails.
      }
    };

    loadTrainInfo();
  }, [user, trainNumber, journeyData?.journeyDate]);

  useEffect(() => {
    if (!user || !journeyId || !coachId) return undefined;

    let active = true;

    const handleGroupUnavailable = (message) => {
      clearStoredJourney();
      setPassengers([]);
      setMessages([]);
      if (message) toast(message);
      navigate('/group', { replace: true });
    };

    const syncCoachData = async () => {
      try {
        const [{ data: journeyDataResp }, { data: groupData }, { data: requestData }] = await Promise.all([
          getCurrentJourneyCompat(),
          getJourneyGroup(journeyId, coachId),
          getRequests(journeyId, coachId),
        ]);

        if (!active) return;

        if (!journeyDataResp?.journey) {
          handleGroupUnavailable('This train group is no longer active.');
          return;
        }

        const storedJourney = JSON.parse(localStorage.getItem('jg_journey') || '{}');
        localStorage.setItem('jg_journey', JSON.stringify({
          ...storedJourney,
          trainNumber: journeyDataResp.journey.train_number || storedJourney.trainNumber || '',
          trainName: journeyDataResp.journey.train_name || storedJourney.trainName || '',
          displayName: journeyDataResp.journey.display_name || storedJourney.displayName || '',
          journeyDate: journeyDataResp.journey.journey_date || storedJourney.journeyDate || '',
          coach: journeyDataResp.journey.coach || storedJourney.coach || 'general',
          seat: journeyDataResp.journey.berth || journeyDataResp.journey.seat || storedJourney.seat || '',
          berthStatus: journeyDataResp.journey.berth_status || storedJourney.berthStatus || '',
          joinMode: journeyDataResp.journey.join_mode || storedJourney.joinMode || '',
        }));

        const memberList = (groupData?.passengers || []).map((passenger) =>
          passenger.uid === user?.uid && localDisplayName
            ? { ...passenger, display_name: localDisplayName }
            : passenger
        );
        if (!memberList.some((passenger) => passenger.uid === user?.uid)) {
          handleGroupUnavailable('You are no longer part of this train group.');
          return;
        }

        setPassengers(memberList);

        const activeMessages = (requestData?.requests || [])
          .filter((item) => item.type !== 'AI')
          .map((item) =>
            item.uid === user?.uid && localDisplayName
              ? { ...item, display_name: localDisplayName }
              : item
          );
        setMessages(activeMessages);

        if (
          activeMessages.length > 0 &&
          activeMessages[activeMessages.length - 1].id !== lastMessageIdRef.current &&
          activeMessages[activeMessages.length - 1].uid !== user.uid
        ) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const latest = activeMessages[activeMessages.length - 1];
            const latestPassenger = memberList.find((passenger) => passenger.uid === latest.uid) || {};
            const rt = getReqType(latest.type, reqTypeMap);
            new Notification('New update in your train group', {
              body: `${getMessageSenderName(latest, latestPassenger)}: ${latest.message || rt.label}`,
              icon: '/favicon.ico',
            });
          }
        }

        if (activeMessages.length > 0) {
          lastMessageIdRef.current = activeMessages[activeMessages.length - 1].id;
        }
      } catch (error) {
        if (!active) return;
        const status = error?.response?.status;
        if (status === 403 || status === 404) {
          handleGroupUnavailable('This train group is no longer available.');
          return;
        }
        console.error('Failed to sync coach data', error);
      }
    };

    syncCoachData();
    const intervalId = window.setInterval(syncCoachData, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [coachId, journeyId, localDisplayName, navigate, reqTypeMap, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const sendMessage = async (overrideMessage) => {
    const text = (overrideMessage ?? messageText).trim();
    if (!text) {
      toast.error('Enter a message');
      return;
    }

    setSending(true);
    try {
      const replyHeader = replyTo
        ? `Replying to ${getMessageSenderName(replyTo, passengerByUid[replyTo.uid] || {})}: ${replyTo.message || getReqType(replyTo.type, reqTypeMap).label}\n`
        : '';

      await sendRequest({
        journey_id: journeyId,
        coach_id: coachId,
        request_type: selectedReq || 'CHAT',
        message: `${replyHeader}${text}`,
      });

      setSelectedReq(null);
      setMessageText('');
      setReplyTo(null);
      toast.success('Sent to the train group');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not send your message');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (message) => {
    if (!message?.id || message.uid !== user?.uid) {
      toast.error('You can delete only your own messages');
      return;
    }

    try {
      await deleteRequest(journeyId, coachId, message.id);
      toast.success('Message removed');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not delete this message');
    }
  };

  const handleReportMessage = async (message) => {
    if (!message?.id || message.uid === user?.uid || message.type === 'SYSTEM' || message.is_system) {
      return;
    }

    const reason = window.prompt('Tell us briefly why you are reporting this message.', 'Abusive language');
    if (reason === null) return;

    try {
      const { data } = await reportRequest(journeyId, coachId, message.id, { reason });
      if (data?.blocked) {
        toast.success('Report submitted. This passenger has now been blocked from the group.');
      } else {
        toast.success(`Report submitted. ${data?.reports_remaining ?? ''} more report(s) needed for auto-block.`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not report this message');
    }
  };

  const sendAcceptedReply = async (message) => {
    setSelectedReq('CHAT');
    await sendMessage(`Accepted: ${message}`);
  };

  const startEditingMessage = (message) => {
    setEditingMessageId(message.id);
    setEditingMessageText(message.message || '');
    setReplyTo(null);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId('');
    setEditingMessageText('');
  };

  const saveEditedMessage = async (message) => {
    const nextMessage = editingMessageText.trim();
    if (!nextMessage) {
      toast.error('Enter a message');
      return;
    }

    setSavingMessageEdit(true);
    try {
      const res = await updateRequest(journeyId, coachId, message.id, {
        message: nextMessage,
      });
      const updatedMessage = res.data?.request || {};
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id
            ? { ...item, ...updatedMessage, message: nextMessage }
            : item
        )
      );
      cancelEditingMessage();
      toast.success('Message updated');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not edit this message');
    } finally {
      setSavingMessageEdit(false);
    }
  };

  const stopLocationShare = async (announce = true) => {
    try {
      if (watchRef.current) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      await stopLocationTracking(journeyId);
      setSharingLocation(false);
      setCurrentLocation(null);
      setLocationLink('');
      lastCoordsRef.current = null;

      if (locationMessageId) {
        await deleteRequest(journeyId, coachId, locationMessageId);
        setLocationMessageId('');
      }

      if (announce) {
        toast.success('Live location sharing stopped');
      }
    } catch (error) {
      toast.error('Could not stop location sharing');
    }
  };

  const startLocationShare = async () => {
    const unavailableMessage = getGeolocationUnavailableMessage();
    if (unavailableMessage) {
      toast.error(unavailableMessage);
      return;
    }

    let sessionCreated = false;
    let createdRequestId = '';

    try {
      const initialPosition = await requestGeolocationPermission(
        DEFAULT_GEOLOCATION_OPTIONS
      );

      setSharingLocation(true);
      lastCoordsRef.current = null;

      const res = await startLocationTracking({
        journey_id: journeyId,
        passenger_id: myPassengerId,
        train_number: trainNumber,
        journey_date: journeyData.journeyDate,
        user_email: user?.email || '',
      });
      sessionCreated = true;

      const link = resolveTrackingLink(res.data?.tracking_link);
      setLocationLink(link || '');
      const expiresAt = Date.now() + 60 * 60 * 1000;

      const requestRes = await sendRequest({
        journey_id: journeyId,
        coach_id: coachId,
        request_type: 'LOCATION',
        message: 'Live train location active for 1 hour.',
        location_link: link,
        expires_at: expiresAt,
      });
      createdRequestId = requestRes.data?.request_id || '';
      setLocationMessageId(createdRequestId);

      const sendCoords = async (coords) => {
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
        const payload = {
          journey_id: journeyId,
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        };
        lastCoordsRef.current = payload;
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
        await updateLocation(payload);
        if (createdRequestId) {
          await updateRequest(journeyId, coachId, createdRequestId, {
            lat: coords.latitude,
            lng: coords.longitude,
            google_maps_url: googleMapsUrl,
            location_link: link,
            expires_at: expiresAt,
            message: 'Live train location active for 1 hour.',
            accuracy: coords.accuracy,
          });
        }
      };

      await sendCoords(initialPosition.coords);

      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          sendCoords(pos.coords).catch(() => {});
        },
        (error) => {
          const errorMessage = getGeolocationErrorMessage(error);
          stopLocationShare(false)
            .catch(() => {})
            .finally(() => {
              toast.error(errorMessage);
            });
        },
        DEFAULT_GEOLOCATION_OPTIONS
      );

      intervalRef.current = setInterval(() => {
        if (lastCoordsRef.current) {
          updateLocation(lastCoordsRef.current).catch(() => {});
        }
      }, 30000);

      timeoutRef.current = setTimeout(() => {
        stopLocationShare(false).catch(() => {});
      }, 60 * 60 * 1000);

      toast.success('Live location shared in the train group');
    } catch (error) {
      if (watchRef.current) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (createdRequestId) {
        await deleteRequest(journeyId, coachId, createdRequestId).catch(() => {});
        setLocationMessageId('');
      }
      if (sessionCreated) {
        await stopLocationTracking(journeyId).catch(() => {});
      }

      setSharingLocation(false);
      setCurrentLocation(null);
      setLocationLink('');
      lastCoordsRef.current = null;

      toast.error(
        error?.response?.data?.detail ||
          error?.message ||
          'Could not start location sharing'
      );
    }
  };

  const copyLocationLink = async () => {
    if (!locationLink) return;
    await navigator.clipboard.writeText(locationLink);
    toast.success('Tracking link copied');
  };

  const draftRacSeatMessage = () => {
    if (!racSeatPartner) return;
    const seatLabel = [journeyData?.coach, journeyData?.seat || journeyData?.berth].filter(Boolean).join('-');
    setSelectedReq('CHAT');
    setReplyTo(null);
    setMessageText(
      `Hi ${getMessageSenderName(racSeatPartner)}, I am your RAC seat partner for ${seatLabel}. Let's coordinate here.`
    );
  };

  const saveIdentityName = async () => {
    const displayName = identityNameDraft.trim();
    if (!displayName) {
      toast.error('Enter the name you want to show in the group');
      return;
    }
    if (displayName.length > 40) {
      toast.error('Name must be 40 characters or fewer');
      return;
    }

    setIdentityNameSaving(true);
    try {
      const savedName = await persistDisplayName(displayName);

      setPassengers((prev) =>
        prev.map((passenger) =>
          passenger.uid === user?.uid
            ? { ...passenger, display_name: savedName }
            : passenger
        )
      );
      setMessages((prev) =>
        prev.map((message) =>
          message.uid === user?.uid
            ? { ...message, display_name: savedName }
            : message
        )
      );

      setEditingIdentityName(false);
      toast.success('Group name updated');
    } catch (error) {
      toast.error(error?.message || 'Could not update group name');
    } finally {
      setIdentityNameSaving(false);
    }
  };

  return (
    <div className="page-shell train-group-page">
      <div className="container section-stack" style={{ maxWidth: 980 }}>
        <div className="rail-shell coach-hero" style={{ padding: 'clamp(1.15rem, 3vw, 1.8rem)' }}>
          <div className="coach-window-strip" aria-hidden="true" />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => navigate('/group')} className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} />
              Back to My Group
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontSize: 'clamp(1.15rem, 3vw, 1.6rem)', marginBottom: '0.2rem' }}>
                  {groupName}
                </h1>
                <div style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
                  {trainInfo?.train_name || journeyData?.trainName || `Train ${trainNumber || ''}`.trim()}
                </div>
              </div>
              <div className="action-chip" style={{ cursor: 'default' }}>
                Your coach: {(journeyData?.coach || 'general').toString().toUpperCase()}
              </div>
              {journeyData?.berthStatus && (
                <div className="action-chip" style={{ cursor: 'default' }}>
                  {journeyData.berthStatus}
                </div>
              )}
              <div className="action-chip" style={{ cursor: 'default' }}>
                <Users size={15} />
                {passengers.length} members
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Your group name</div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, marginBottom: 4 }}>
                {currentDisplayName}
              </div>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                {currentIdentityMeta}
              </div>
            </div>
            <button
              className="action-chip"
              onClick={() => setEditingIdentityName((value) => !value)}
            >
              <PenSquare size={14} />
              {editingIdentityName ? 'Cancel' : 'Edit name'}
            </button>
          </div>

          {editingIdentityName && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="input"
                  type="text"
                  value={identityNameDraft}
                  onChange={(e) => setIdentityNameDraft(e.target.value)}
                  placeholder="Enter your name for this group"
                  maxLength={40}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={saveIdentityName}
                  disabled={identityNameSaving}
                  style={{ minWidth: 130, justifyContent: 'center' }}
                >
                  {identityNameSaving ? 'Saving...' : 'Save Name'}
                </button>
              </div>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                Your chosen name will show in the group, and your coach and berth details will stay underneath it.
              </div>
            </div>
          )}
        </div>

        {locationLink && (
          <div className="glass-card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6 }}>Public tracking link</div>
              <div style={{ color: 'var(--text2)', wordBreak: 'break-all' }}>{locationLink}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="action-chip" onClick={copyLocationLink}>
                <Copy size={14} />
                Copy link
              </button>
              <a className="action-chip" href={locationLink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <ExternalLink size={14} />
                Open Google location
              </a>
              {currentLocation && (
                <a
                  className="action-chip"
                  href={`https://www.google.com/maps/search/?api=1&query=${currentLocation.lat},${currentLocation.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <MapPin size={14} />
                  Open latest pin
                </a>
              )}
            </div>
          </div>
        )}

        {racSeatPartner && (
          <div className="glass-card" style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(217,119,6,0.12)', color: '#b45309' }}>
                RAC Match
              </span>
              <strong>{getMessageSenderName(racSeatPartner)}</strong>
              <span style={{ color: 'var(--text2)' }}>
                is sharing coach {(journeyData?.coach || '').toString().toUpperCase()} seat {(journeyData?.seat || journeyData?.berth || '').toString().toUpperCase()}.
              </span>
            </div>
            <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
              You can message each other here to coordinate the shared RAC seat.
            </div>
            <div>
              <button className="btn btn-secondary btn-sm" onClick={draftRacSeatMessage}>
                Message RAC Partner
              </button>
            </div>
          </div>
        )}

        <div className="card coach-chat-shell" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>Train conversation lane</h2>
            </div>
            <div className="chip-row">
              <div className="action-chip" style={{ cursor: 'default' }}>
                <Users size={14} />
                {passengers.length} members
              </div>
              <div className="action-chip" style={{ cursor: 'default' }}>
                <MessageSquare size={14} />
                {messages.length} updates
              </div>
            </div>
          </div>

          <div className="coach-timeline">
            <div className="coach-seat-map" aria-hidden="true">
              {Array.from({ length: 11 }).map((_, row) => (
                <div className="coach-seat-row" key={`row-${row}`}>
                  <div className="seat-pack left">
                    <span className="mini-seat" />
                    <span className="mini-seat" />
                  </div>
                  <div className="seat-aisle-rail" />
                  <div className="seat-pack right">
                    {Array.from({ length: 6 }).map((__, idx) => (
                      <span className="mini-seat" key={`r-${row}-${idx}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="aisle-markings" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            {messages.length === 0 ? (
              <div className="coach-empty-state">
                No updates yet. Send a train message or use one of the quick request chips above.
              </div>
            ) : (
              messages.map((message, idx) => {
                const type = getReqType(message.type, reqTypeMap);
                const isMine = message.uid === user?.uid;
                const passenger = passengerByUid[message.uid] || {};
                const senderCoach = message.coach || passenger.coach || '';
                const senderBerth = message.berth || passenger.berth || '';
                const senderBerthStatus = message.berth_status || passenger.berth_status || '';
                const senderName = getMessageSenderName(message, passenger);
                const senderMeta = type.id === 'SYSTEM'
                  ? 'JourneyGuard system update'
                  : formatSenderMeta(senderCoach, senderBerth, senderBerthStatus);
                const isAccepted =
                  type.id !== 'CHAT' &&
                  messages.some(
                    (other) =>
                      other.message === `Accepted: ${message.message || type.label}` && other.uid !== message.uid
                  );
                const isEditingThisMessage = editingMessageId === message.id;
                const canEditMessage =
                  isMine &&
                  !isAccepted &&
                  !isEditingThisMessage &&
                  type.id !== 'SYSTEM' &&
                  type.id !== 'LOCATION' &&
                  isMessageEditable(message.timestamp);

                return (
                  <div
                    key={message.id}
                    className={`coach-message-row ${isMine ? 'mine' : 'other'}`}
                    style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                  >
                    <div className={`message-bubble ${isMine ? 'mine' : 'other'}`}>
                      <div className="message-head">
                        <div className="message-sender-block">
                          <strong className="message-sender-name">{senderName}</strong>
                          <div className="message-sender-meta">{senderMeta}</div>
                        </div>
                        <span className="message-time">
                          {formatMessageTime(message.timestamp)}
                          {message.edited_at ? ' • edited' : ''}
                        </span>
                      </div>

                      <div className="message-chip-row">
                        <span className="badge" style={{ background: `${type.color}18`, color: type.color }}>
                          {type.label}
                        </span>
                        {isAccepted && (
                          <span className="badge badge-success">
                            <CheckCircle2 size={12} />
                            Accepted
                          </span>
                        )}
                      </div>

                      {isEditingThisMessage ? (
                        <div style={{ display: 'grid', gap: '0.65rem' }}>
                          <textarea
                            className="input"
                            value={editingMessageText}
                            onChange={(e) => setEditingMessageText(e.target.value)}
                            rows={3}
                            style={{ resize: 'vertical', minHeight: 88 }}
                          />
                          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <button
                              className="action-chip"
                              onClick={() => saveEditedMessage(message)}
                              disabled={savingMessageEdit}
                            >
                              {savingMessageEdit ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              className="action-chip"
                              onClick={cancelEditingMessage}
                              disabled={savingMessageEdit}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : type.id === 'LOCATION' && message.lat && message.lng ? (
                        <LocationMessageCard message={message} />
                      ) : (
                        <div className="message-text">
                          {renderMessageBody(message.message || type.label)}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                        {!isMine && !isAccepted && type.id !== 'SYSTEM' && (
                          <button className="action-chip" onClick={() => setReplyTo(message)}>
                            Reply
                          </button>
                        )}
                        {!isMine && type.id !== 'SYSTEM' && (
                          <button className="action-chip" onClick={() => handleReportMessage(message)}>
                            <Flag size={14} />
                            Report
                          </button>
                        )}
                        {type.id !== 'CHAT' && type.id !== 'SYSTEM' && !isMine && !isAccepted && (
                          <button className="action-chip" onClick={() => sendAcceptedReply(message.message || type.label)}>
                            Accept request
                          </button>
                        )}
                        {isMine && (
                          <>
                            {canEditMessage && (
                              <button className="action-chip" onClick={() => startEditingMessage(message)}>
                                <PenSquare size={14} />
                                Edit
                              </button>
                            )}
                            <button
                              className="action-chip"
                              onClick={() => deleteMessage(message)}
                              disabled={isEditingThisMessage}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {replyTo && (
            <div className="glass-card" style={{ padding: '0.9rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                  Replying to <strong style={{ color: 'var(--text)' }}>{getMessageSenderName(replyTo, passengerByUid[replyTo.uid] || {})}</strong>: {replyTo.message || getReqType(replyTo.type, reqTypeMap).label}
                </div>
                <button className="action-chip" onClick={() => setReplyTo(null)}>
                  Cancel reply
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {REQ_TYPES.filter((item) => !['CHAT', 'SYSTEM'].includes(item.id)).map((type) => (
                <button
                  key={type.id}
                  className="action-chip"
                  onClick={() => {
                    if (type.id === 'LOCATION') {
                      if (sharingLocation) {
                        stopLocationShare();
                      } else {
                        startLocationShare();
                      }
                      return;
                    }
                    setSelectedReq(type.id);
                    setMessageText(type.label);
                  }}
                  style={{ color: type.color }}
                >
                  {type.icon}
                  {type.id === 'LOCATION' ? (sharingLocation ? 'Stop location' : type.label) : type.label}
                </button>
              ))}
            </div>
            <input
              className="input"
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={selectedReq ? `Add context for ${getReqType(selectedReq, reqTypeMap).label.toLowerCase()}` : 'Type a message to everyone on this train'}
              style={{ flex: 1, minWidth: 220 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button
              onClick={() => sendMessage()}
              className="btn btn-primary"
              disabled={!messageText.trim() || sending}
              style={{ minWidth: 140, justifyContent: 'center' }}
            >
              {sending ? <span className="spinner" /> : <><Send size={16} /> Send</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getReqType(type, reqTypeMap) {
  return reqTypeMap[type] || { id: 'CHAT', label: 'Message', color: 'var(--text2)' };
}

function isMessageEditable(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return false;
  return Date.now() - value <= MESSAGE_EDIT_WINDOW_MS;
}

function formatMessageTime(timestamp) {
  if (!timestamp) return 'just now';
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return 'just now';

  try {
    return formatDistanceToNow(value, { addSuffix: true });
  } catch {
    return 'just now';
  }
}

function renderMessageBody(text) {
  const value = text || '';
  const parts = value.split(/(https?:\/\/\S+)/g);
  return parts.map((part, index) => {
    if (/^https?:\/\/\S+$/.test(part)) {
      return (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
          {part}
        </a>
      );
    }
    return <React.Fragment key={`${index}-${part}`}>{part}</React.Fragment>;
  });
}

function LocationMessageCard({ message }) {
  const googleMapsUrl = message.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${message.lat},${message.lng}`;
  const googleEmbedUrl = `https://maps.google.com/maps?q=${message.lat},${message.lng}&z=14&output=embed`;
  const minutesLeft = message.expires_at ? Math.max(0, Math.ceil((message.expires_at - Date.now()) / 60000)) : null;
  const trackingLink = resolveTrackingLink(message.location_link);

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
        {message.message || 'Live train location'}
      </div>
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', minHeight: 180 }}>
        <iframe
          title={`location-${message.id}`}
          src={googleEmbedUrl}
          style={{ width: '100%', height: 180, border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.45rem 0.7rem',
            borderRadius: 999,
            background: 'rgba(8,13,26,0.82)',
            color: '#eef2ff',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          <TrainFront size={14} />
          Live train
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="action-chip" style={{ textDecoration: 'none' }}>
          <ExternalLink size={14} />
          Open in Google Maps
        </a>
        {trackingLink && (
          <a href={trackingLink} target="_blank" rel="noreferrer" className="action-chip" style={{ textDecoration: 'none' }}>
            <MapPin size={14} />
            Open live tracker
          </a>
        )}
        {minutesLeft !== null && (
          <span className="action-chip" style={{ cursor: 'default' }}>
            Expires in {minutesLeft} min
          </span>
        )}
      </div>
    </div>
  );
}

function getMessageSenderName(message, passenger = {}) {
  return (
    passenger?.display_name ||
    message?.display_name ||
    message?.passenger_id ||
    passenger?.passenger_id ||
    'Traveler'
  );
}

function formatSenderMeta(coach, berth, berthStatus) {
  const coachValue = String(coach || '').trim();
  const berthValue = String(berth || '').trim();
  const berthStatusValue = String(berthStatus || '').trim().toUpperCase();

  if (coachValue.toLowerCase() === 'general') {
    return 'General passenger';
  }

  const parts = [];
  if (coachValue) {
    parts.push(`Coach ${coachValue.toUpperCase()}`);
  }
  if (berthValue) {
    parts.push(`Berth ${berthValue.toUpperCase()}`);
  }
  if (berthStatusValue) {
    parts.push(berthStatusValue);
  }

  return parts.join(' • ') || 'Train passenger';
}

