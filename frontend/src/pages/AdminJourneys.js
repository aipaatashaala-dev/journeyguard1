import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CalendarDays, LayoutPanelLeft, Train, Trash2, Users } from 'lucide-react';
import { clearAdminSession, deleteAdminJourney, getAdminJourneys } from '../utils/adminApi';

export default function AdminJourneys() {
  const navigate = useNavigate();
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadJourneys = async () => {
    try {
      const res = await getAdminJourneys();
      setJourneys(res.data.sort((a, b) => b.passenger_count - a.passenger_count));
    } catch (error) {
      clearAdminSession();
      toast.error(error?.response?.data?.detail || 'Could not load journeys');
      navigate('/admin', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJourneys();
  }, [navigate]);

  const removeJourney = async (journey) => {
    if (!window.confirm(`Delete journey group ${journey.group_id}? This will remove the group, chat, and linked location session.`)) {
      return;
    }

    try {
      await deleteAdminJourney(journey.group_id);
      toast.success('Journey group deleted');
      loadJourneys();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to delete journey group');
    }
  };

  return (
    <div className="page-shell">
      <div className="container section-stack">
        <div className="rail-shell" style={{ padding: 'clamp(1.15rem, 3vw, 2rem)' }}>
          <Link to="/admin/dashboard" className="btn btn-secondary btn-sm" style={{ width: 'fit-content', marginBottom: '1rem' }}>
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
          <div className="route-pill" style={{ marginBottom: '1rem' }}>Journey Monitor</div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: '0.8rem' }}>Active journeys at a glance</h1>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text2)' }}>Loading journeys...</p>
          </div>
        ) : (
          <>
            <div className="dashboard-grid">
              <div className="card" style={{ padding: '1.3rem' }}>
                <div style={{ color: 'var(--text2)', marginBottom: '0.35rem' }}>Active journey groups</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{journeys.length}</div>
              </div>
              <div className="card" style={{ padding: '1.3rem' }}>
                <div style={{ color: 'var(--text2)', marginBottom: '0.35rem' }}>Coaches represented</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{journeys.reduce((sum, item) => sum + item.coach_count, 0)}</div>
              </div>
              <div className="card" style={{ padding: '1.3rem' }}>
                <div style={{ color: 'var(--text2)', marginBottom: '0.35rem' }}>Passengers across groups</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{journeys.reduce((sum, item) => sum + item.passenger_count, 0)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {journeys.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text2)' }}>No active journeys</div>
              ) : (
                journeys.map((journey) => (
                  <div key={journey.group_id} className="ticket-card" style={{ padding: '1.4rem 1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                          Group {journey.group_id}
                        </div>
                        <h2 style={{ fontSize: '1.55rem', margin: '0.4rem 0 0.2rem' }}>Train {journey.train_number}</h2>
                        <div style={{ color: '#52627d' }}>{journey.date}</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                          <span className="action-chip" style={{ cursor: 'default' }}>
                            Status: {journey.status || 'active'}
                          </span>
                          {journey.cleanup_at && (
                            <span className="action-chip" style={{ cursor: 'default' }}>
                              Cleanup: {new Date(journey.cleanup_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 140, padding: '0.85rem 1rem', borderRadius: 16, background: 'rgba(32,50,79,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52627d', fontSize: '0.82rem' }}>
                            <Users size={14} />
                            Passengers
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 800, marginTop: 4 }}>{journey.passenger_count}</div>
                        </div>
                        <div style={{ minWidth: 140, padding: '0.85rem 1rem', borderRadius: 16, background: 'rgba(32,50,79,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52627d', fontSize: '0.82rem' }}>
                            <LayoutPanelLeft size={14} />
                            Coaches represented
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 800, marginTop: 4 }}>{journey.coach_count}</div>
                        </div>
                        <button onClick={() => removeJourney(journey)} className="btn btn-danger btn-sm">
                          <Trash2 size={14} />
                          Delete Group
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52627d' }}>
                        <Train size={16} />
                        Live rail grouping
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#52627d' }}>
                        <CalendarDays size={16} />
                        Journey date {journey.date}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
