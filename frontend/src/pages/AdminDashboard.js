import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Activity, AlertTriangle, ArrowRight, LogOut, MapPin, Shield, Train, Users } from 'lucide-react';
import { clearAdminSession, getAdminSession, getAdminStats, readAdminSession } from '../utils/adminApi';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_users: 0,
    active_journeys: 0,
    active_locations: 0,
    pending_requests: 0,
    system_health: 'Checking',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        await getAdminSession();
        const res = await getAdminStats();
        setStats(res.data);
      } catch (error) {
        clearAdminSession();
        toast.error(error?.response?.data?.detail || 'Admin session expired');
        navigate('/admin', { replace: true });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  const handleLogout = () => {
    clearAdminSession();
    navigate('/admin', { replace: true });
  };

  const adminEmail = readAdminSession().adminEmail || 'journeyguard@zohomail.in';
  const statCards = [
    { label: 'Passengers in system', value: stats.total_users, icon: <Users size={22} color="var(--accent)" /> },
    { label: 'Active journeys', value: stats.active_journeys, icon: <Train size={22} color="var(--rail-gold)" /> },
    { label: 'Live locations', value: stats.active_locations, icon: <MapPin size={22} color="var(--accent2)" /> },
    { label: 'Open requests', value: stats.pending_requests, icon: <AlertTriangle size={22} color="var(--danger)" /> },
  ];

  return (
    <div className="page-shell">
      <div className="container section-stack">
        <div className="rail-shell" style={{ padding: 'clamp(1.15rem, 3vw, 2rem)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="route-pill" style={{ marginBottom: '1rem' }}>Operations Deck</div>
              <h1 style={{ fontSize: 'clamp(2.1rem, 5vw, 3.4rem)', marginBottom: '0.8rem' }}>
                Keep the network of active journeys readable.
              </h1>
              <p style={{ color: 'var(--text2)', maxWidth: 700, lineHeight: 1.8 }}>
                OTP-authenticated admin access is active for <strong style={{ color: 'var(--text)' }}>{adminEmail}</strong>.
              </p>
            </div>
            <button onClick={handleLogout} className="btn btn-secondary">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text2)' }}>Loading operations data...</p>
          </div>
        ) : (
          <>
            <div className="dashboard-grid">
              {statCards.map((card) => (
                <div key={card.label} className="card" style={{ padding: '1.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ width: 50, height: 50, borderRadius: 16, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {card.icon}
                    </div>
                    <ArrowRight size={16} color="var(--text3)" />
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>{card.value}</div>
                  <div style={{ color: 'var(--text2)' }}>{card.label}</div>
                </div>
              ))}
            </div>

            <div className="split-grid">
              <div className="ticket-card" style={{ padding: 'clamp(1.1rem, 3vw, 1.6rem)' }}>
                <div style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                  Admin Shortcuts
                </div>
                <h2 style={{ fontSize: '1.7rem', margin: '0.45rem 0 1rem' }}>Jump into live surfaces</h2>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {[
                    ['/admin/users', 'Review registered users'],
                    ['/admin/journeys', 'See the currently active train journeys'],
                    ['/admin/locations', 'Inspect live location sessions'],
                    ['/admin/requests', 'Handle unresolved assistance requests'],
                  ].map(([href, text]) => (
                    <Link
                      key={href}
                      to={href}
                      style={{
                        textDecoration: 'none',
                        color: '#20324f',
                        padding: '0.9rem 1rem',
                        borderRadius: 14,
                        background: 'rgba(32,50,79,0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 700,
                      }}
                    >
                      <span>{text}</span>
                      <ArrowRight size={16} />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
                  <Activity size={18} color="var(--success)" />
                  <h3 style={{ margin: 0 }}>System status</h3>
                </div>
                <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.1rem' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>{stats.system_health}</div>
                  <div style={{ color: 'var(--text2)', marginTop: 4 }}>
                    Last checked at {new Date().toLocaleTimeString()}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {[
                    'Admin login now uses OTP sent to the official mailbox.',
                    'Operational data is loaded from backend admin endpoints.',
                    'Session access is isolated from passenger login state.',
                  ].map((item) => (
                    <div key={item} className="info-row">
                      <Shield size={15} color="var(--accent)" />
                      <span style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
