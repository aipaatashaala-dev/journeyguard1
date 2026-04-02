import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, ShieldCheck, KeyRound } from 'lucide-react';
import {
  hasValidAdminSession,
  requestAdminOtp,
  saveAdminSession,
  verifyAdminOtp,
} from '../utils/adminApi';

const ADMIN_EMAIL = 'journeyguard@zohomail.in';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState('request');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasValidAdminSession()) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [navigate]);

  const sendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestAdminOtp(ADMIN_EMAIL);
      toast.success(`OTP sent to ${ADMIN_EMAIL}`);
      setStep('verify');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await verifyAdminOtp(ADMIN_EMAIL, otp);
      saveAdminSession(res.data);
      toast.success('Admin login successful');
      navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 430, padding: '2rem', background: 'linear-gradient(180deg, var(--surface2), #fff7ee)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', border: '1px solid var(--border)' }}>
        <div style={{ width: 58, height: 58, margin: '0 auto 1rem', borderRadius: 18, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={28} color="#1d4ed8" />
        </div>
        <h2 style={{ textAlign: 'center', marginBottom: '0.6rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>Admin OTP Login</h2>
        <p style={{ textAlign: 'center', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.6rem' }}>
          Admin access is sent only to <strong style={{ color: 'var(--text)' }}>{ADMIN_EMAIL}</strong>.
        </p>

        {step === 'request' ? (
          <form onSubmit={sendOtp}>
            <div style={{ marginBottom: '1.3rem' }}>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 700 }}>Admin Email</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.85rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff' }}>
                <Mail size={16} color="var(--text3)" />
                <span style={{ color: 'var(--text)' }}>{ADMIN_EMAIL}</span>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <div style={{ marginBottom: '1.3rem' }}>
              <label style={{ display: 'block', marginBottom: '0.45rem', fontWeight: 700 }}>Enter OTP</label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={16} color="var(--text3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit OTP"
                  required
                  style={{ width: '100%', padding: '0.9rem 1rem 0.9rem 2.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', fontSize: '1rem', letterSpacing: '0.18em' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <button type="submit" disabled={loading || otp.length !== 6} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
              <button type="button" disabled={loading} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setStep('request')}>
                Send a new OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
