import React, { useEffect, useState } from 'react';

const COOKIE_CONSENT_KEY = 'jg_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    setVisible(!stored);
  }, []);

  const handleChoice = (value) => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1200,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 920,
          width: '100%',
          padding: '1rem 1.1rem',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          boxShadow: '0 20px 50px rgba(0,0,0,0.24)',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Cookie consent</strong>
          <span style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
            JourneyGuard uses cookies and similar local storage to keep you signed in, remember preferences, and improve the website experience.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => handleChoice('necessary')}>
            Necessary only
          </button>
          <button type="button" className="btn btn-primary" onClick={() => handleChoice('all')}>
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
