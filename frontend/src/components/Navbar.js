import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Train, Users, MapPin, LogOut, Menu, X } from 'lucide-react';

const navLinks = [
  { to: '/dashboard', icon: <Train size={16} />, label: 'Dashboard' },
  { to: '/journey', icon: <MapPin size={16} />, label: 'Journey' },
  { to: '/protection', icon: <Shield size={16} />, label: 'Protection' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isAdmin = user?.email?.includes('admin');

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(8,13,26,0.92)', backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      height: '60px', display: 'flex', alignItems: 'center',
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Logo */}
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{
            width: '30px', height: '30px', background: 'var(--accent)',
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={16} color="#080d1a" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent)' }}>
            JourneyGuard
          </span>
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          {navLinks.map(({ to, icon, label }) => (
            <Link key={to} to={to} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '0.45rem 0.9rem', borderRadius: 'var(--radius-xs)',
              textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500,
              color: location.pathname === to ? 'var(--accent)' : 'var(--text2)',
              background: location.pathname === to ? 'var(--accent-dim)' : 'transparent',
              transition: 'all 0.2s',
            }}>
              {icon} {label}
            </Link>
          ))}
        </div>

        {/* User + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            fontSize: '0.78rem', color: 'var(--text2)',
            maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.email}
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-xs)',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text2)', cursor: 'pointer', fontSize: '0.8rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.target.style.borderColor = 'var(--danger)'; e.target.style.color = 'var(--danger)'; }}
            onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text2)'; }}
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
