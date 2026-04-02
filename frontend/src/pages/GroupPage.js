import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { ref, onValue, push, set, remove, update } from 'firebase/database';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Send,
  Trash2,
  Heart,
  UtensilsCrossed,
  BedDouble,
  MessageSquare,
  Bot,
  CheckCircle2,
  Users,
  MapPin,
  Copy,
  ExternalLink,
  TrainFront,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  getPrivateAiThread,
  sendPrivateAiMessage,
  startLocationTracking,
  stopLocationTracking,
  updateLocation,
} from '../utils/api';
import { API_BASE_URL } from '../utils/config';
import './GroupPage.css';

const REQ_TYPES = [
  { id: 'MEDICAL', label: 'Medical emergency', icon: <Heart size={14} />, color: 'var(--danger)' },
  { id: 'FOOD_NEED', label: 'Need food', icon: <UtensilsCrossed size={14} />, color: 'var(--accent3)' },
  { id: 'FOOD_HAS', label: 'Can share food', icon: <UtensilsCrossed size={14} />, color: 'var(--success)' },
  { id: 'BERTH', label: 'Berth exchange', icon: <BedDouble size={14} />, color: 'var(--accent2)' },
  { id: 'LOCATION', label: 'Live location', icon: <MapPin size={14} />, color: 'var(--accent)' },
  { id: 'AI', label: 'Ask AI privately', icon: <Bot size={14} />, color: '#9ad1ff' },
  { id: 'SYSTEM', label: 'Journey update', icon: <TrainFront size={14} />, color: '#3657c8' },
  { id: 'CHAT', label: 'Message', icon: <MessageSquare size={14} />, color: 'var(--text2)' },
];

export default function GroupPage() {
  const { journeyId, coachId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [passengers, setPassengers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedReq, setSelectedReq] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationLink, setLocationLink] = useState('');
  const [locationMessageId, setLocationMessageId] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [trainInfo, setTrainInfo] = useState(null);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiMessageText, setAiMessageText] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const lastMessageIdRef = useRef(null);
  const bottomRef = useRef(null);
  const aiBottomRef = useRef(null);
  const aiPanelRef = useRef(null);
  const aiInputRef = useRef(null);
  const watchRef = useRef(null);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastCoordsRef = useRef(null);

  const storedPassengerId = localStorage.getItem('jg_passenger_id');
  const journeyData = JSON.parse(localStorage.getItem('jg_journey') || '{}');
  const myPassengerId = storedPassengerId || journeyData.passengerId || `Passenger-${user?.uid?.slice(-4) || 'guest'}`;
  const trainNumber = journeyId?.split('_')[0];
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
  const passengerById = useMemo(() => {
    const map = {};
    passengers.forEach((p) => {
      if (p?.passenger_id) map[p.passenger_id] = p;
    });
    return map;
  }, [passengers]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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
        }
      } catch {
        // Keep the coach chat usable even if train metadata fetch fails.
      }
    };

    loadTrainInfo();
  }, [user, trainNumber, journeyData?.journeyDate]);

  useEffect(() => {
    if (!user || !journeyId || !coachId) return;

    let active = true;

    const loadAiThread = async () => {
      try {
        const { data } = await getPrivateAiThread(journeyId, coachId);
        if (active) {
          setAiMessages(data?.messages || []);
        }
      } catch {
        if (active) {
          setAiMessages([]);
        }
      }
    };

    loadAiThread();
    const intervalId = window.setInterval(loadAiThread, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user, journeyId, coachId]);

  useEffect(() => {
    const pasRef = ref(db, `train_groups/${journeyId}/${coachId}`);
    const unsub = onValue(pasRef, (snap) => {
      if (!snap.exists()) {
        clearStoredJourney();
        setPassengers([]);
        setMessages([]);
        toast('This coach group is no longer active.');
        navigate('/group', { replace: true });
        return;
      }

      const list = [];
      snap.forEach((child) => {
        const data = child.val();
        if (data?.passenger_id && child.key !== 'requests') {
          list.push({ uid: child.key, ...data });
        }
      });

      if (!list.some((passenger) => passenger.uid === user?.uid)) {
        clearStoredJourney();
        setPassengers([]);
        setMessages([]);
        toast('You are no longer part of this coach group.');
        navigate('/group', { replace: true });
        return;
      }

      setPassengers(list);
    });

    return () => unsub();
  }, [journeyId, coachId, navigate, user?.uid]);

  useEffect(() => {
    const reqRef = ref(db, `train_groups/${journeyId}/${coachId}/requests`);
    const unsub = onValue(reqRef, (snap) => {
      const list = [];
      snap.forEach((child) => {
        list.push({ id: child.key, ...child.val() });
      });
      list.sort((a, b) => a.timestamp - b.timestamp);
      const activeMessages = [];
      list.forEach((item) => {
        if (item.expires_at && Date.now() >= item.expires_at) {
          remove(ref(db, `train_groups/${journeyId}/${coachId}/requests/${item.id}`)).catch(() => {});
          return;
        }
        if (item.type === 'AI') {
          return;
        }
        activeMessages.push(item);
      });
      setMessages(activeMessages);

      if (
        activeMessages.length > 0 &&
        activeMessages[activeMessages.length - 1].id !== lastMessageIdRef.current &&
        activeMessages[activeMessages.length - 1].uid !== user.uid
      ) {
        if ('Notification' in window && Notification.permission === 'granted') {
          const latest = activeMessages[activeMessages.length - 1];
          const rt = getReqType(latest.type, reqTypeMap);
          new Notification(`New update in coach ${coachId?.replace('coach_', '')}`, {
            body: `${latest.passenger_id}: ${latest.message || rt.label}`,
            icon: '/favicon.ico',
          });
        }
      }

      if (activeMessages.length > 0) {
        lastMessageIdRef.current = activeMessages[activeMessages.length - 1].id;
      }
    });

    return () => unsub();
  }, [journeyId, coachId, user?.uid, reqTypeMap]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  useEffect(() => () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const focusAiPanel = () => {
    aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      aiInputRef.current?.focus();
    }, 150);
  };

  const sendAiMessage = async (overrideMessage) => {
    const text = (overrideMessage ?? aiMessageText).replace(/^@ai\s+/i, '').trim();
    if (!text) {
      toast.error('Enter a question for JourneyGuard AI');
      return;
    }

    setAiSending(true);
    try {
      const { data } = await sendPrivateAiMessage({
        journey_id: journeyId,
        coach_id: coachId,
        message: text,
        train_number: trainNumber,
        journey_date: journeyData?.journeyDate || null,
        train_name: trainInfo?.train_name || journeyData?.trainName || null,
        from_station: trainInfo?.from_station || journeyData?.fromStation || null,
        to_station: trainInfo?.to_station || journeyData?.toStation || null,
        current_station: trainInfo?.current_station || null,
        next_station_name: trainInfo?.next_station_name || null,
        expected_arrival: trainInfo?.expected_arrival || trainInfo?.arrival || null,
        speed: trainInfo?.speed || null,
      });

      setAiMessages(data?.messages || []);
      setAiMessageText('');
      setSelectedReq(null);
      setMessageText('');
      setReplyTo(null);
      toast.success('Private AI reply ready for you');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'AI could not reply right now');
    } finally {
      setAiSending(false);
    }
  };

  const sendMessage = async (overrideMessage) => {
    const text = (overrideMessage ?? messageText).trim();
    if (!text) {
      toast.error('Enter a message');
      return;
    }

    if (selectedReq === 'AI' || text.toLowerCase().startsWith('@ai ')) {
      await sendAiMessage(text);
      return;
    }

    setSending(true);
    try {
      const reqRef = ref(db, `train_groups/${journeyId}/${coachId}/requests`);
      const newReq = push(reqRef);
      const replyHeader = replyTo
        ? `Replying to ${replyTo.passenger_id}: ${replyTo.message || getReqType(replyTo.type, reqTypeMap).label}\n`
        : '';

      await set(newReq, {
        passenger_id: myPassengerId,
        type: selectedReq || 'CHAT',
        message: `${replyHeader}${text}`,
        timestamp: Date.now(),
        uid: user.uid,
      });

      setSelectedReq(null);
      setMessageText('');
      setReplyTo(null);
      toast.success('Sent to your coach group');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (msgId) => {
    await remove(ref(db, `train_groups/${journeyId}/${coachId}/requests/${msgId}`));
    toast.success('Message removed');
  };

  const sendAcceptedReply = async (message) => {
    setSelectedReq('CHAT');
    await sendMessage(`Accepted: ${message}`);
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

      if (locationMessageId) {
        await remove(ref(db, `train_groups/${journeyId}/${coachId}/requests/${locationMessageId}`));
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
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      return;
    }

    try {
      setSharingLocation(true);

      const res = await startLocationTracking({
        journey_id: journeyId,
        passenger_id: myPassengerId,
        train_number: trainNumber,
        journey_date: journeyData.journeyDate,
        user_email: user?.email || '',
      });

      const link = res.data?.tracking_link;
      setLocationLink(link || '');
      const expiresAt = Date.now() + 60 * 60 * 1000;

      const reqRef = ref(db, `train_groups/${journeyId}/${coachId}/requests`);
      const newReq = push(reqRef);
      setLocationMessageId(newReq.key);
      await set(newReq, {
        passenger_id: myPassengerId,
        type: 'LOCATION',
        message: 'Live train location active for 1 hour.',
        location_link: link,
        expires_at: expiresAt,
        timestamp: Date.now(),
        uid: user.uid,
      });

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
        if (newReq.key) {
          await update(ref(db, `train_groups/${journeyId}/${coachId}/requests/${newReq.key}`), {
            lat: coords.latitude,
            lng: coords.longitude,
            google_maps_url: googleMapsUrl,
            location_link: link,
            expires_at: expiresAt,
            message: 'Live train location active for 1 hour.',
          });
        }
      };

      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          sendCoords(pos.coords).catch(() => {});
        },
        (error) => {
          setSharingLocation(false);
          toast.error(error.message || 'Location permission denied');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        }
      );

      intervalRef.current = setInterval(() => {
        if (lastCoordsRef.current) {
          updateLocation(lastCoordsRef.current).catch(() => {});
        }
      }, 30000);

      timeoutRef.current = setTimeout(() => {
        stopLocationShare(false).catch(() => {});
      }, 60 * 60 * 1000);

      toast.success('Live location shared in the coach group');
    } catch (error) {
      setSharingLocation(false);
      toast.error(error?.response?.data?.detail || 'Could not start location sharing');
    }
  };

  const copyLocationLink = async () => {
    if (!locationLink) return;
    await navigator.clipboard.writeText(locationLink);
    toast.success('Tracking link copied');
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
                  {coachId?.replace('coach_', '').toUpperCase()} Group
                </h1>
                <div style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
                  {trainInfo?.train_name || journeyData?.trainName || `Train ${trainNumber || ''}`.trim()}
                </div>
              </div>
              <div className="action-chip" style={{ cursor: 'default' }}>
                <Users size={15} />
                {passengers.length} members
              </div>
            </div>
          </div>
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

        <div ref={aiPanelRef} className="card" style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={18} color="#2563eb" />
                JourneyGuard AI
              </h2>
              <div style={{ color: 'var(--text2)', lineHeight: 1.7, maxWidth: 760 }}>
                This AI conversation is private to you. Other passengers in the coach cannot see your AI questions or AI replies.
                If you ask for berth change help, AI will try to suggest the right people from the current coach and draft a polite request.
              </div>
            </div>
            <div className="action-chip" style={{ cursor: 'default', color: '#1d4ed8' }}>
              <Bot size={14} />
              Private to you
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1rem', minHeight: 220, maxHeight: 340, overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
            {aiMessages.length === 0 ? (
              <div style={{ color: 'var(--text2)', lineHeight: 1.8 }}>
                Ask anything about your journey, berth exchange, stations, train timing, or nearby help.
                Example: <strong style={{ color: 'var(--text)' }}>Can you help me find someone for berth change from berth 28?</strong>
              </div>
            ) : (
              aiMessages.map((item) => (
                <div
                  key={item.id}
                  style={{
                    justifySelf: item.role === 'assistant' ? 'stretch' : 'end',
                    maxWidth: item.role === 'assistant' ? '100%' : '82%',
                    padding: '0.9rem 1rem',
                    borderRadius: 18,
                    background: item.role === 'assistant' ? 'rgba(37,99,235,0.08)' : 'rgba(233,116,24,0.1)',
                    border: item.role === 'assistant'
                      ? '1px solid rgba(37,99,235,0.16)'
                      : '1px solid rgba(233,116,24,0.18)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{item.sender_label || (item.role === 'assistant' ? 'JourneyGuard AI' : 'You')}</strong>
                      <span className="badge" style={{ background: item.role === 'assistant' ? 'rgba(37,99,235,0.12)' : 'rgba(233,116,24,0.14)', color: item.role === 'assistant' ? '#1d4ed8' : 'var(--accent)' }}>
                        {item.role === 'assistant' ? 'AI reply' : 'Your question'}
                      </span>
                    </div>
                    <span style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>
                      {formatMessageTime(item.timestamp)}
                    </span>
                  </div>
                  <div style={{ color: '#111827', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                    {renderMessageBody(item.content)}
                  </div>
                </div>
              ))
            )}
            <div ref={aiBottomRef} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={aiInputRef}
              className="input"
              type="text"
              value={aiMessageText}
              onChange={(e) => setAiMessageText(e.target.value)}
              placeholder="Ask AI privately, for example: help me find the right person for berth change"
              style={{ flex: 1, minWidth: 260 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendAiMessage();
                }
              }}
            />
            <button
              onClick={() => sendAiMessage()}
              className="btn btn-primary"
              disabled={!aiMessageText.trim() || aiSending}
              style={{ minWidth: 170, justifyContent: 'center' }}
            >
              {aiSending ? <span className="spinner" /> : <><Bot size={16} /> Ask AI Privately</>}
            </button>
          </div>
        </div>

        <div className="card coach-chat-shell" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>Coach conversation lane</h2>
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
                No updates yet. Send a coach message or use one of the quick request chips above.
              </div>
            ) : (
              messages.map((message, idx) => {
                const type = getReqType(message.type, reqTypeMap);
                const isMine =
                  message.uid === user?.uid ||
                  message.passenger_id === myPassengerId;
                const seatSlot = getSeatSlot(`${message.passenger_id}-${message.uid || ''}`);
                const seatHint = passengerById[message.passenger_id]?.berth || seatSlot.toUpperCase();
                const isAccepted =
                  type.id !== 'CHAT' &&
                  messages.some(
                    (other) =>
                      other.message === `Accepted: ${message.message || type.label}` && other.uid !== message.uid
                  );

                return (
                  <div
                    key={message.id}
                    className={`coach-message-row ${isMine ? 'mine' : 'other'}`}
                    style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                  >
                    <div className={`seat-anchor ${isMine ? 'mine' : 'other'}`}>
                      <span className="seat-label">{seatHint}</span>
                    </div>

                    <div className={`message-bubble ${isMine ? 'mine' : 'other'}`}>
                      <div className="message-head">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>{message.passenger_id}</strong>
                          <span className="badge" style={{ background: `${type.color}20`, color: type.color }}>
                            {type.label}
                          </span>
                          {isAccepted && (
                            <span className="badge badge-success">
                              <CheckCircle2 size={12} />
                              Accepted
                            </span>
                          )}
                        </div>
                        <span style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>
                          {formatMessageTime(message.timestamp)}
                        </span>
                      </div>

                      {type.id === 'LOCATION' && message.lat && message.lng ? (
                        <LocationMessageCard message={message} />
                      ) : (
                        <div style={{ color: '#111827', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {renderMessageBody(message.message || type.label)}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                        {!isMine && !isAccepted && !['AI', 'SYSTEM'].includes(type.id) && (
                          <button className="action-chip" onClick={() => setReplyTo(message)}>
                            Reply
                          </button>
                        )}
                        {type.id !== 'CHAT' && !['AI', 'SYSTEM'].includes(type.id) && !isMine && !isAccepted && (
                          <button className="action-chip" onClick={() => sendAcceptedReply(message.message || type.label)}>
                            Accept request
                          </button>
                        )}
                        {isMine && (
                          <button className="action-chip" onClick={() => deleteMessage(message.id)}>
                            <Trash2 size={14} />
                            Delete
                          </button>
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
                  Replying to <strong style={{ color: 'var(--text)' }}>{replyTo.passenger_id}</strong>: {replyTo.message || getReqType(replyTo.type, reqTypeMap).label}
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
                    if (type.id === 'AI') {
                      setSelectedReq('AI');
                      setMessageText('');
                      focusAiPanel();
                      toast('AI chat is private and visible only to you');
                      return;
                    }
                    setSelectedReq(type.id);
                    setMessageText(type.label);
                  }}
                  style={type.id === 'AI'
                    ? {
                        color: '#ffffff',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        borderColor: 'rgba(29, 78, 216, 0.85)',
                        boxShadow: '0 10px 24px rgba(37, 99, 235, 0.22)',
                      }
                    : { color: type.color }}
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
              placeholder={
                selectedReq === 'AI'
                  ? 'AI mode is private. Type here with @ai or use the private AI box above.'
                  : selectedReq
                    ? `Add context for ${getReqType(selectedReq, reqTypeMap).label.toLowerCase()}`
                    : 'Type a message to your coach'
              }
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
        {message.location_link && (
          <a href={message.location_link} target="_blank" rel="noreferrer" className="action-chip" style={{ textDecoration: 'none' }}>
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

function getSeatSlot(seedText) {
  const slots = ['l1', 'l2', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
  const seed = (seedText || 'seat').toString();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return slots[hash % slots.length];
}

