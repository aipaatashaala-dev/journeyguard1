import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { ref, update, onValue } from 'firebase/database';
import { saveDisplayName as persistDisplayName } from '../utils/displayName';
import toast from 'react-hot-toast';
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';

export default function SettingsPage() {
  const { user, changePassword } = useAuth();
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({});
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const providerIds = new Set((user?.providerData || []).map((provider) => provider?.providerId).filter(Boolean));
  const requiresCurrentPassword = providerIds.has('password');
  const hasGoogleProvider = providerIds.has('google.com');

  useEffect(() => {
    if (!user?.uid) return;
    const userRef = ref(db, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
      const fallbackDisplayName =
        data.display_name ||
        user?.displayName ||
        user?.email?.split('@')[0] ||
        '';
      const nextProfile = {
        email: data.email || user?.email || '',
        ...data,
        display_name: fallbackDisplayName,
      };
      setProfile(nextProfile);
      setFormData(nextProfile);
    });
    return unsubscribe;
  }, [user?.uid, user?.displayName, user?.email]);

  const saveDisplayName = async () => {
    const displayName = (formData.display_name || '').trim();
    if (!displayName) {
      toast.error('Name is required');
      return;
    }
    if (displayName.length > 40) {
      toast.error('Name must be 40 characters or fewer');
      return;
    }

    setDisplayNameLoading(true);
    try {
      const savedName = await persistDisplayName(displayName);
      setProfile((prev) => ({ ...(prev || {}), display_name: savedName }));
      setFormData((prev) => ({ ...(prev || {}), display_name: savedName }));

      toast.success('Chat name updated successfully');
      setEditingDisplayName(false);
    } catch (e) {
      toast.error('Failed to update name: ' + e.message);
    } finally {
      setDisplayNameLoading(false);
    }
  };

  const saveEmail = async () => {
    if (!formData.email?.trim()) {
      toast.error('Email is required');
      return;
    }

    setLoading(true);
    try {
      await update(ref(db, `users/${user.uid}`), { email: formData.email.trim() });
      toast.success('Email updated successfully');
      setEditingEmail(false);
    } catch (e) {
      toast.error('Failed to update email: ' + e.message);
    }
    setLoading(false);
  };

  const savePassword = async () => {
    if (requiresCurrentPassword && !passwordForm.currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Enter and confirm your new password');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      await update(ref(db, `users/${user.uid}`), {
        password_set: true,
        updated_at: Date.now(),
      });
      toast.success(requiresCurrentPassword ? 'Password changed successfully' : 'Password set successfully');
      setEditingPassword(false);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (e) {
      toast.error(getPasswordErrorMessage(e));
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!profile) {
    return <div className="page-shell" style={{ color: 'var(--text2)' }}>Loading settings...</div>;
  }

  return (
    <div className="page-shell">
      <div className="container section-stack" style={{ maxWidth: 820 }}>
        <div className="rail-shell" style={{ padding: 'clamp(1.15rem, 3vw, 2rem)' }}>
          <div className="route-pill" style={{ marginBottom: '1rem' }}>
            <ShieldCheck size={14} />
            Account Settings
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: '0.75rem' }}>
            Keep settings focused on the essentials.
          </h1>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8, maxWidth: 700 }}>
            Update the name people see in train chat, keep your account email current, and change your password when needed.
          </p>
        </div>

        <div className="card" style={{ padding: '1.35rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Profile</h2>
          <div className="field-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserRound size={16} color="var(--accent)" />
                <strong>Train chat name</strong>
              </div>
              <button
                onClick={() => setEditingDisplayName((value) => !value)}
                style={{ background: 'none', border: 'none', color: 'var(--rail-gold)', cursor: 'pointer', fontWeight: 700 }}
              >
                {editingDisplayName ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editingDisplayName ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <input
                  className="input"
                  type="text"
                  value={formData.display_name || ''}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Enter the name you want in group chat"
                  maxLength={40}
                />
                <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                  Your custom name will show above your coach and berth details in the train group.
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button onClick={saveDisplayName} className="btn btn-primary" disabled={displayNameLoading}>
                    {displayNameLoading ? 'Saving...' : 'Save Name'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                {profile.display_name || user?.displayName || user?.email?.split('@')[0] || 'Traveler'}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '1.35rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Primary email</h2>
          <div className="field-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mail size={16} color="var(--accent)" />
                <strong>Account email</strong>
              </div>
              <button
                onClick={() => setEditingEmail(!editingEmail)}
                style={{ background: 'none', border: 'none', color: 'var(--rail-gold)', cursor: 'pointer', fontWeight: 700 }}
              >
                {editingEmail ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editingEmail ? (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  style={{ flex: 1, minWidth: 220 }}
                />
                <button onClick={saveEmail} className="btn btn-primary" disabled={loading}>
                  Save
                </button>
              </div>
            ) : (
              <div style={{ color: 'var(--text2)', lineHeight: 1.7, wordBreak: 'break-word' }}>{profile.email}</div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '1.35rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Security</h2>
          <div className="field-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <KeyRound size={16} color="var(--accent2)" />
                <strong>{requiresCurrentPassword ? 'Change password' : 'Set password'}</strong>
              </div>
              <button
                onClick={() => {
                  setEditingPassword((value) => !value);
                  if (editingPassword) {
                    setPasswordForm({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: '',
                    });
                  }
                }}
                style={{ background: 'none', border: 'none', color: 'var(--rail-gold)', cursor: 'pointer', fontWeight: 700 }}
              >
                {editingPassword ? 'Cancel' : requiresCurrentPassword ? 'Change' : 'Set'}
              </button>
            </div>

            {editingPassword ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                  {requiresCurrentPassword
                    ? 'Confirm your current password, then choose a new one.'
                    : hasGoogleProvider
                      ? 'Choose a password for email login. You may be asked to confirm with Google first.'
                      : 'Choose a new password for this account.'}
                </div>
                {requiresCurrentPassword && (
                  <input
                    className="input"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    placeholder="Current password"
                  />
                )}
                <input
                  className="input"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="New password"
                />
                <input
                  className="input"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                />
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button onClick={savePassword} className="btn btn-primary" disabled={passwordLoading}>
                    {passwordLoading ? 'Saving...' : requiresCurrentPassword ? 'Update Password' : 'Save Password'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                {requiresCurrentPassword
                  ? 'Update your account password from here.'
                  : 'Add a password so you can also log in with email and password later.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getPasswordErrorMessage(error) {
  const code = error?.code || '';

  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Current password is incorrect';
  }
  if (code === 'auth/weak-password') {
    return 'Choose a stronger password with at least 6 characters';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Please sign in again, then retry changing your password';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google confirmation was closed before completing';
  }
  return error?.message || 'Failed to update password';
}
