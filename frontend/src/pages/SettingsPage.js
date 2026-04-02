import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { ref, update, onValue } from 'firebase/database';
import toast from 'react-hot-toast';
import { Mail, ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({});
  const [editingEmail, setEditingEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const userRef = ref(db, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setProfile(data);
        setFormData(data);
      }
    });
    return unsubscribe;
  }, [user?.uid]);

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
            This screen now keeps only the main account email and removes the unused phone, IMEI, and backup-contact blocks.
          </p>
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
      </div>
    </div>
  );
}
