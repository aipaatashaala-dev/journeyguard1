import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Lock, Mail, Shield } from 'lucide-react';
import {
  getApiErrorMessage,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithOtp,
} from '../utils/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    otp: '',
    resetToken: '',
    password: '',
    confirmPassword: '',
  });

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!form.email) return toast.error('Enter your email address');

    setLoading(true);
    try {
      await requestPasswordResetOtp({ email: form.email });
      setForm((prev) => ({ ...prev, otp: '', resetToken: '', password: '', confirmPassword: '' }));
      toast.success('OTP sent to your email');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!form.email || !form.otp) return toast.error('Enter email and OTP');

    setLoading(true);
    try {
      const { data } = await verifyPasswordResetOtp({ email: form.email, otp: form.otp });
      setForm((prev) => ({ ...prev, resetToken: data?.reset_token || '' }));
      toast.success('OTP verified');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not verify OTP'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!form.resetToken) return toast.error('Verify OTP first');
    if (!form.password || !form.confirmPassword) return toast.error('Enter the new password');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      await resetPasswordWithOtp({
        email: form.email,
        reset_token: form.resetToken,
        password: form.password,
        confirm_password: form.confirmPassword,
      });
      toast.success('Password updated successfully');
      navigate('/auth');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not reset password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1.5rem', display: 'flex', alignItems: 'center' }}>
      <div className="container auth-grid" style={{ width: '100%' }}>
        <div className="rail-shell" style={{ padding: 'clamp(1.25rem, 4vw, 2.4rem)', minHeight: 640 }}>
          <Link to="/auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text2)', textDecoration: 'none', marginBottom: '1rem' }}>
            <ArrowLeft size={16} />
            Back to sign in
          </Link>
          <div className="route-pill" style={{ marginBottom: '1rem' }}>
            <Shield size={14} />
            Password Recovery
          </div>
          <h1 style={{ fontSize: 'clamp(2.3rem, 6vw, 4rem)', lineHeight: 1.05, marginBottom: '1rem' }}>
            Reset your password in three safe steps.
          </h1>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 560 }}>
            Enter your email address, verify the OTP sent there, and then choose a new password for your JourneyGuard account.
          </p>
        </div>

        <div className="card" style={{ padding: 'clamp(1.1rem, 3vw, 2rem)', maxWidth: 520, width: '100%', margin: '0 auto', display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>Forgot Password</h2>
            <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
              Use your email OTP to recover access.
            </p>
          </div>

          <form onSubmit={handleSendOtp} style={{ display: 'grid', gap: '0.75rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" style={{ paddingLeft: '2.2rem' }} />
              </div>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={loading} style={{ justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : 'Send OTP'}
            </button>
          </form>

          <form onSubmit={handleVerifyOtp} style={{ display: 'grid', gap: '0.75rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>OTP</label>
              <input type="text" value={form.otp} onChange={update('otp')} placeholder="Enter 6-digit OTP" maxLength={6} />
            </div>
            <button type="submit" className="btn btn-secondary" disabled={loading || !form.email} style={{ justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : 'Verify OTP'}
            </button>
          </form>

          {form.resetToken && (
            <form onSubmit={handleResetPassword} style={{ display: 'grid', gap: '0.75rem' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>New Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input type="password" value={form.password} onChange={update('password')} placeholder="New password" style={{ paddingLeft: '2.2rem' }} />
                </div>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input type="password" value={form.confirmPassword} onChange={update('confirmPassword')} placeholder="Confirm new password" style={{ paddingLeft: '2.2rem' }} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
                {loading ? <span className="spinner" /> : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
