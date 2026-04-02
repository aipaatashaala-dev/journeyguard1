import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Settings, LogOut, X, AlertCircle, Users } from 'lucide-react';

export default function Sidebar({ isOpen = true, isMobile = false, onClose }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const navigationItems = [
    { path: '/protection', icon: <Shield size={20} />, label: 'Protection', desc: 'Remote safety dashboard' },
    { path: '/group', icon: <Users size={20} />, label: 'My Group', desc: 'Ready to chat' },
    { path: '/settings', icon: <Settings size={20} />, label: 'Settings', desc: 'Profile & account' },
    { path: '/contact', icon: <AlertCircle size={20} />, label: 'Contact Us', desc: 'Get help and support' },
  ];

  const isActive = (path) => location.pathname === path;

  const NavContent = () => (
    <>
      {/* Header */}
      <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '1.5rem' }}>
          <div style={{ width: 40, height: 40, background: 'var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--accent)' }}>JourneyGuard</div>
          </div>
        </Link>
        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
          Logged in as<br />
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{user?.email}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '1.5rem 0.75rem', flex: 1 }}>
        {navigationItems.map((item) => (
          <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }} onClick={() => onClose?.()}>
            <div style={{
              padding: '1rem',
              marginBottom: '0.5rem',
              borderRadius: 'var(--radius-sm)',
              background: isActive(item.path) ? 'rgba(233,116,24,0.1)' : 'transparent',
              border: isActive(item.path) ? '1px solid rgba(233,116,24,0.2)' : '1px solid transparent',
              color: isActive(item.path) ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ fontSize: 'var(--accent)' }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: isActive(item.path) ? 'var(--accent)' : 'var(--text)' }}>{item.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{item.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '1.5rem 0.75rem', borderTop: '1px solid var(--border)' }}>
        <button onClick={handleLogout} style={{
          width: '100%',
          padding: '0.85rem',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          color: 'var(--text2)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: '0.9rem',
          fontWeight: 600,
          transition: 'all 0.2s',
          borderBottom: '1px solid rgba(181,102,24,0.08)',
        }}
        onMouseEnter={e => e.target.style.color = 'var(--text)'}
        onMouseLeave={e => e.target.style.color = 'var(--text2)'}
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="desktop-sidebar" style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: isMobile ? 'min(86vw, 320px)' : 280,
        height: '100vh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        zIndex: 1200,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.2s ease',
        boxShadow: isMobile ? '0 20px 45px rgba(76,42,20,0.22)' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 0.75rem 0 0.75rem' }}>
          <button
            type="button"
            onClick={() => onClose?.()}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>
        <NavContent />
      </div>

      {isMobile && isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(76,42,20,0.12)',
            zIndex: 1190,
          }}
          onClick={() => onClose?.()}
        />
      )}

      {/* Mobile styles */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar {
            width: min(86vw, 320px) !important;
          }
        }
      `}</style>
    </>
  );
}
