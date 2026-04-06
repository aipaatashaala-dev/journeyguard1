import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Shield, Mail, Lock, Eye, EyeOff, TrainFront, Ticket, ArrowRight } from 'lucide-react';
import { db, firebaseConfigLooksPlaceholder } from '../firebase';
import { ref, set, get } from 'firebase/database';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M9 7.364v3.709h5.16c-.227 1.193-.907 2.204-1.933 2.884l3.127 2.427c1.822-1.678 2.873-4.147 2.873-7.091 0-.68-.061-1.335-.174-1.929H9z" />
      <path fill="#34A853" d="M9 18c2.61 0 4.798-.865 6.398-2.34l-3.127-2.427c-.865.58-1.97.924-3.271.924-2.51 0-4.633-1.694-5.392-3.972H.376v2.503A8.998 8.998 0 0 0 9 18z" />
      <path fill="#4A90E2" d="M3.608 10.185A5.41 5.41 0 0 1 3.306 8.4c0-.62.106-1.224.302-1.785V4.112H.376A8.997 8.997 0 0 0 0 8.4c0 1.452.347 2.827.376 4.288l3.232-2.503z" />
      <path fill="#FBBC05" d="M9 3.578c1.42 0 2.694.489 3.698 1.451l2.775-2.776C13.794.689 11.61 0 9 0A8.998 8.998 0 0 0 .376 4.112l3.232 2.503C4.367 4.337 6.49 3.578 9 3.578z" />
    </svg>
  );
}

export default function AuthPage() {
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const { register, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'register') {
      setMode('register');
    }
  }, [location.search]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const getSocialSignInError = (error) => {
    const providerLabel = 'Google';
    const code = error?.code || '';

    if (firebaseConfigLooksPlaceholder) {
      return `${providerLabel} sign-in is not configured. Check your Firebase web app env values.`;
    }
    if (code === 'auth/popup-closed-by-user') {
      return `${providerLabel} sign-in cancelled`;
    }
    if (code === 'auth/popup-blocked') {
      return `${providerLabel} popup was blocked by the browser`;
    }
    if (code === 'auth/cancelled-popup-request') {
      return `${providerLabel} popup request was interrupted`;
    }
    if (code === 'auth/unauthorized-domain') {
      return `${providerLabel} sign-in blocked: this domain is not authorized in Firebase`;
    }
    if (code === 'auth/operation-not-allowed') {
      return `${providerLabel} sign-in is not enabled in Firebase Authentication`;
    }
    if (code === 'auth/network-request-failed') {
      return `${providerLabel} sign-in failed due to a network problem`;
    }
    if (error?.message) {
      return `${providerLabel} sign-in failed: ${error.message}`;
    }
    return `${providerLabel} sign-in failed`;
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (!form.password || !form.confirmPassword) return toast.error('All fields required');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password, confirm_password: form.confirmPassword }),
      });

      if (!response.ok) throw new Error('Failed to set password');

      toast.success('Password set successfully! You can now login with email and password.');
      navigate('/dashboard');
    } catch (e) {
      toast.error(e.message || 'Failed to set password');
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.confirmPassword) return toast.error('All fields required');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      const cred = await register(form.email, form.password);
      const uid = cred.user.uid;

      await set(ref(db, `users/${uid}`), {
        email: form.email,
        display_name: form.email.split('@')[0],
        created_at: Date.now(),
      });

      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (e) {
      if (e.code === 'auth/email-already-in-use' || e.response?.status === 409) {
        toast.error('Email already registered');
      } else {
        toast.error(e.message || 'Registration failed');
      }
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Fill all fields');

    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (e) {
      toast.error('Invalid email or password');
    }
    setLoading(false);
  };

  const handleSocialLogin = async () => {
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      const uid = result.user.uid;
      const email = result.user.email;
      const displayName = result.user.displayName || email.split('@')[0];

      const userData = await get(ref(db, `users/${uid}`));
      const existingData = userData.val() || {};

      if (!existingData.password_set) {
        await set(ref(db, `users/${uid}`), {
          email,
          display_name: displayName,
          created_at: Date.now(),
        });
        setShowPasswordSetup(true);
      } else {
        toast.success('Welcome!');
        navigate('/dashboard');
      }
    } catch (e) {
      toast.error(getSocialSignInError(e), { duration: 6000 });
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1.5rem', display: 'flex', alignItems: 'center' }}>
      <div className="container auth-grid" style={{ width: '100%' }}>
        <div className="rail-shell" style={{ padding: 'clamp(1.25rem, 4vw, 2.4rem)', minHeight: 640 }}>
          <div className="route-pill" style={{ marginBottom: '1rem' }}>
            <TrainFront size={14} />
            Boarding Lounge
          </div>

          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '1.4rem' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: 'linear-gradient(135deg, var(--accent), var(--rail-gold))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={18} color="#09111f" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)' }}>JourneyGuard</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>Coach-ready travel safety</div>
            </div>
          </Link>

          <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', lineHeight: 1.04, marginBottom: '1rem' }}>
            Step into a calmer way to travel.
          </h1>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 560, marginBottom: '2rem' }}>
            Create your account once, then use your train details to unlock a coach-aware dashboard, trip context,
            and support tools that feel native to railway travel.
          </p>

          <div className="ticket-card" style={{ padding: 'clamp(1rem, 3vw, 1.4rem)', maxWidth: 540 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6a7c99' }}>
                  Passenger Preview
                </div>
                <h3 style={{ marginTop: '0.35rem', fontSize: '1.4rem' }}>What opens after sign-in</h3>
              </div>
              <Ticket size={24} color="#20324f" />
            </div>

            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {[
                'A travel dashboard with berth and coach context',
                'PNR-based grouping instead of manual searching',
                'Structured assistance flows for food, berth, and emergencies',
                'A cleaner handoff to protection and live location features',
              ].map((item) => (
                <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <ArrowRight size={15} color="#20324f" style={{ marginTop: 4, flexShrink: 0 }} />
                  <span style={{ lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'clamp(1.1rem, 3vw, 2rem)', maxWidth: 520, width: '100%', margin: '0 auto' }}>
          {firebaseConfigLooksPlaceholder && (
            <div
              style={{
                padding: '0.9rem 1rem',
                borderRadius: 14,
                background: 'rgba(255,77,109,0.08)',
                border: '1px solid rgba(255,77,109,0.2)',
                color: 'var(--text2)',
                lineHeight: 1.7,
                marginBottom: '1.25rem',
              }}
            >
              Firebase web config looks incomplete. Social sign-in will fail until your `REACT_APP_FIREBASE_*` values are set correctly.
            </div>
          )}
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="route-pill" style={{ marginBottom: '0.9rem' }}>
              {mode === 'login' ? 'Return Passenger' : 'New Boarding'}
            </div>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>
              {mode === 'login' ? 'Sign in to your journey' : 'Create your travel account'}
            </h2>
            <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
              {mode === 'login'
                ? 'Pick up where your last trip left off.'
                : 'Set up your account and start using the railway-focused dashboard.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 12, padding: 4, marginBottom: '1.25rem' }}>
            {['login', 'register'].map((tab) => (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  background: mode === tab ? 'linear-gradient(135deg, var(--accent), var(--rail-gold))' : 'transparent',
                  color: mode === tab ? '#09111f' : 'var(--text2)',
                }}
              >
                {tab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '0.7rem', marginBottom: '1.15rem' }}>
            <button
              type="button"
              onClick={handleSocialLogin}
              disabled={loading}
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', gap: '0.7rem', background: '#fff', color: '#111827', borderColor: 'rgba(17,24,39,0.12)' }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                <GoogleLogo />
              </span>
              Continue with Google
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.25rem', color: 'var(--text3)', fontSize: '0.82rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>or continue with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
            <div className="input-group">
              <label>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" style={{ paddingLeft: '2.2rem' }} />
              </div>
            </div>

            <div className="input-group">
              <label>{mode === 'login' ? 'Password' : 'Create Password'}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder="Enter password"
                  style={{ paddingLeft: '2.2rem', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text3)',
                  }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="input-group">
                <label>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={update('confirmPassword')}
                    placeholder="Confirm password"
                    style={{ paddingLeft: '2.2rem', paddingRight: '2.5rem' }}
                  />
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.4rem' }}>
              {loading ? <span className="spinner" /> : mode === 'login' ? 'Enter Dashboard' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.84rem', color: 'var(--text2)', marginTop: '1.25rem' }}>
            {mode === 'login' ? 'Need a new account?' : 'Already travelling with us?'}{' '}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              style={{ background: 'none', border: 'none', color: 'var(--rail-gold)', cursor: 'pointer', fontWeight: 700 }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>

          {showPasswordSetup && (
            <div className="glass-card" style={{ padding: '1.2rem', marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.4rem' }}>Set a password for later</h3>
              <p style={{ color: 'var(--text2)', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1rem' }}>
                You signed in with a social provider. Add a password so email login works on your next trip too.
              </p>
              <form onSubmit={handleSetPassword}>
                <div className="input-group">
                  <label>Password</label>
                  <input type={showPw ? 'text' : 'password'} value={form.password} onChange={update('password')} />
                </div>
                <div className="input-group">
                  <label>Confirm Password</label>
                  <input type={showPw ? 'text' : 'password'} value={form.confirmPassword} onChange={update('confirmPassword')} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? <span className="spinner" /> : 'Save Password'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .auth-grid {
            gap: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
