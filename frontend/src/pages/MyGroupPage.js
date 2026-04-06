import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, ArrowLeft, TrainFront, DoorOpen, CalendarDays, MapPinned } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { getCurrentJourneyCompat, getJourneyGroup, joinGroup, leaveGroup, TRAIN_GROUP_CHANNEL_ID } from '../utils/api';
import { formatTrainGroupName } from '../utils/groupNames';

export default function MyGroupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastJourney, setLastJourney] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }

    const previousJourney = JSON.parse(localStorage.getItem('jg_last_journey') || 'null');
    setLastJourney(previousJourney);

    let active = true;

    const loadGroup = async () => {
      try {
        const { data } = await getCurrentJourneyCompat();
        if (!active) return;

        const journey = data?.journey;
        if (!journey) {
          localStorage.removeItem('jg_journey');
          localStorage.removeItem('jg_group_id');
          localStorage.removeItem('jg_coach_id');
          localStorage.removeItem('jg_passenger_id');
          setGroup(null);
          setLoading(false);
          return;
        }

        const storedJourney = JSON.parse(localStorage.getItem('jg_journey') || '{}');
        const coach = journey.coach || 'general';
        const currentJourney = {
          trainNumber: journey.train_number,
          trainName: journey.train_name || storedJourney.trainName || '',
          journeyDate: journey.journey_date,
          coach,
          seat: journey.berth || journey.seat || '',
        };
        localStorage.setItem('jg_journey', JSON.stringify(currentJourney));
        localStorage.setItem('jg_group_id', journey.group_id);
        localStorage.setItem('jg_coach_id', journey.coach_id);
        if (journey.passenger_id) {
          localStorage.setItem('jg_passenger_id', journey.passenger_id);
        }

        const groupRes = await getJourneyGroup(journey.group_id, journey.coach_id);
        if (!active) return;

        setGroup({
          id: `${journey.group_id}/${journey.coach_id}`,
          groupId: journey.group_id,
          coachId: journey.coach_id,
          trainNumber: currentJourney.trainNumber,
          trainName: currentJourney.trainName,
          journeyDate: currentJourney.journeyDate,
          coach: currentJourney.coach,
          seat: currentJourney.seat || '-',
          members: groupRes.data?.passengers || [],
        });
      } catch (error) {
        if (!active) return;
        if ([403, 404].includes(error?.response?.status)) {
          setGroup(null);
        } else {
          console.error('Failed to load active group', error);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadGroup();
    const intervalId = window.setInterval(loadGroup, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user?.uid]);

  const handleLeaveGroup = async () => {
    if (!group) return;

    setSubmitting(true);
    try {
      const currentJourney = JSON.parse(localStorage.getItem('jg_journey') || '{}');
      localStorage.setItem('jg_last_journey', JSON.stringify(currentJourney));
      await leaveGroup(group.groupId);
      localStorage.removeItem('jg_journey');
      localStorage.removeItem('jg_group_id');
      localStorage.removeItem('jg_coach_id');
      localStorage.removeItem('jg_passenger_id');
      setLastJourney(currentJourney);
      setGroup(null);
      toast.success('You left the group');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not leave group');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejoinGroup = async () => {
    if (!lastJourney) return;

    setSubmitting(true);
    try {
      const res = await joinGroup({
        train_number: lastJourney.trainNumber,
        journey_date: lastJourney.journeyDate,
        coach: lastJourney.coach || 'general',
        berth: lastJourney.seat || lastJourney.berth || '',
        arrival_time: lastJourney.arrivalTime || null,
      });

      localStorage.setItem('jg_journey', JSON.stringify(lastJourney));
      localStorage.setItem('jg_group_id', res.data?.group_id || `${lastJourney.trainNumber}_${lastJourney.journeyDate}`);
      localStorage.setItem('jg_coach_id', res.data?.coach_id || TRAIN_GROUP_CHANNEL_ID);
      localStorage.setItem('jg_passenger_id', res.data?.passenger_id || '');
      toast.success('Group rejoined');
      navigate(`/group/${lastJourney.trainNumber}_${lastJourney.journeyDate}/${res.data?.coach_id || TRAIN_GROUP_CHANNEL_ID}`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not rejoin group');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container section-stack" style={{ maxWidth: 920 }}>
        <div className="rail-shell" style={{ padding: 'clamp(1.15rem, 3vw, 2rem)' }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text2)', textDecoration: 'none', marginBottom: '1rem' }}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
          <div className="route-pill" style={{ marginBottom: '1rem' }}>
            <Users size={14} />
            {formatTrainGroupName(group?.trainName, group?.trainNumber)}
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: '0.75rem' }}>
            Your group space should answer one question quickly: where do I go next?
          </h1>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 720 }}>
            This page now focuses on the current active train group first, with route details, member count, and one
            clear way to enter the live conversation across the whole train.
          </p>
        </div>

        {group ? (
          <div className="ticket-card" style={{ padding: 'clamp(1.2rem, 3vw, 1.8rem)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                  Active boarding pass
                </div>
                <h2 style={{ fontSize: '1.9rem', margin: '0.35rem 0 0.2rem' }}>
                  {formatTrainGroupName(group.trainName, group.trainNumber)}
                </h2>
                <div style={{ color: '#61728f' }}>Your coach: {group.coach}</div>
              </div>
            </div>

            <div className="dashboard-grid" style={{ marginBottom: '1rem' }}>
              <div className="stat-tile">
                <div style={{ fontSize: '0.78rem', color: '#6a7c99', marginBottom: 4 }}>Journey date</div>
                <div style={{ fontWeight: 800 }}>{group.journeyDate}</div>
              </div>
              <div className="stat-tile">
                <div style={{ fontSize: '0.78rem', color: '#6a7c99', marginBottom: 4 }}>Coach</div>
                <div style={{ fontWeight: 800 }}>{group.coach}</div>
              </div>
              <div className="stat-tile">
                <div style={{ fontSize: '0.78rem', color: '#6a7c99', marginBottom: 4 }}>Seat</div>
                <div style={{ fontWeight: 800 }}>{group.seat}</div>
              </div>
              <div className="stat-tile">
                <div style={{ fontSize: '0.78rem', color: '#6a7c99', marginBottom: 4 }}>Passengers in train group</div>
                <div style={{ fontWeight: 800 }}>{group.members.length}</div>
              </div>
            </div>

            <div className="chip-row">
              <div className="action-chip" style={{ cursor: 'default', color: '#20324f', background: 'rgba(32,50,79,0.06)' }}>
                <TrainFront size={15} />
                Train-based grouping
              </div>
              <div className="action-chip" style={{ cursor: 'default', color: '#20324f', background: 'rgba(32,50,79,0.06)' }}>
                <DoorOpen size={15} />
                Your coach {group.coach}
              </div>
              <div className="action-chip" style={{ cursor: 'default', color: '#20324f', background: 'rgba(32,50,79,0.06)' }}>
                <CalendarDays size={15} />
                {group.journeyDate}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <Link to={`/group/${group.groupId}/${group.coachId}`} className="btn btn-primary">
                Open Live Group
              </Link>
              <button type="button" className="btn btn-secondary" onClick={handleLeaveGroup} disabled={submitting}>
                {submitting ? 'Leaving...' : 'Leave Group'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <Users size={30} color="var(--text3)" />
            </div>
            <h3 style={{ fontSize: '1.35rem', marginBottom: '0.45rem' }}>No active train group yet</h3>
            <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 520, margin: '0 auto 1.5rem' }}>
              Your main dashboard is now the single place to board a journey. Once you join from there, this page
              becomes your direct shortcut back into the live group.
            </p>
            <Link to="/dashboard" className="btn btn-primary">
              Go to Dashboard
            </Link>
            {lastJourney && (
              <div className="responsive-actions" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRejoinGroup}
                  disabled={submitting}
                >
                  {submitting ? 'Rejoining...' : 'Rejoin Group'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ padding: '1.3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.85rem' }}>
            <MapPinned size={18} color="var(--rail-gold)" />
            <h3 style={{ margin: 0 }}>Why this page exists now</h3>
          </div>
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {[
              'It gives you one fast route back into the train-wide chat.',
              'It keeps your current train, coach, and seat visible at a glance.',
              'It removes the older duplicate join-group flow and keeps boarding inside the main dashboard.',
            ].map((item) => (
              <div key={item} className="info-row">
                <span style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
