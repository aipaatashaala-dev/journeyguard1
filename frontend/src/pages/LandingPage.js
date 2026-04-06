import React from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Users,
  MapPin,
  Ticket,
  ChevronRight,
  TrainFront,
  BellRing,
  ArrowRight,
} from 'lucide-react';

const features = [
  {
    icon: <Shield size={22} />,
    title: 'Sleep With Backup',
    desc: 'Phone-lift and charger-removal protection for long overnight stretches.',
    color: 'var(--accent)',
    bg: 'var(--accent-dim)',
  },
  {
    icon: <Ticket size={22} />,
    title: 'PNR To Train Group',
    desc: 'Enter a PNR, confirm your berth, and land inside the shared train conversation.',
    color: 'var(--rail-gold)',
    bg: 'var(--rail-gold-dim)',
  },
  {
    icon: <Users size={22} />,
    title: 'Train-Wide Support',
    desc: 'Trade berths, ask for food help, or escalate a medical issue across coaches and general passengers.',
    color: 'var(--accent2)',
    bg: 'var(--accent2-dim)',
  },
  {
    icon: <MapPin size={22} />,
    title: 'Share Live Movement',
    desc: 'Send a route link home and let family follow the trip without exposing your identity in-group.',
    color: 'var(--rail-copper)',
    bg: 'var(--rail-copper-dim)',
  },
];

const stats = [
  ['Train-wide', 'One group for the whole train'],
  ['Anonymous', 'Passenger IDs instead of personal details'],
  ['Live', 'Requests and location updates'],
  ['Night-ready', 'Protection designed for sleeper travel'],
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(181,102,24,0.1)',
          background: 'rgba(255,255,255,0.86)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div
          className="container"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)' }}>
                JourneyGuard
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text3)' }}>For Indian Rail Travel</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/auth" className="btn btn-secondary btn-sm">Sign In</Link>
            <Link to="/auth?mode=register" className="btn btn-primary btn-sm">Create Account</Link>
          </div>
        </div>
      </nav>

      <section style={{ padding: '7.5rem 1.5rem 4rem' }}>
        <div className="container hero-grid">
          <div className="rail-shell" style={{ padding: 'clamp(1.35rem, 4vw, 3rem)', minHeight: 560 }}>
            <div className="route-pill" style={{ marginBottom: '1.25rem' }}>
              <TrainFront size={14} />
              Night Train Companion
            </div>

            <h1
              style={{
                fontSize: 'clamp(3rem, 7vw, 5.4rem)',
                lineHeight: 1,
                marginBottom: '1rem',
                maxWidth: 700,
              }}
            >
              Designed for the way train journeys actually feel.
            </h1>

            <p
              style={{
                fontSize: '1.05rem',
                color: 'var(--text2)',
                lineHeight: 1.8,
                maxWidth: 620,
                marginBottom: '2rem',
              }}
            >
              JourneyGuard blends theft protection, coach coordination, and live trip visibility into one calm
              travel dashboard. It feels less like generic travel software and more like something built for
              overnight berths, charging points, station stops, and real passengers.
            </p>

            <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
              <Link to="/auth?mode=register" className="btn btn-primary btn-lg">
                Start Your Trip
                <ChevronRight size={18} />
              </Link>
              <a href="#journey-features" className="btn btn-secondary btn-lg">Explore Features</a>
            </div>

            <div className="dashboard-grid">
              {stats.map(([title, text]) => (
                <div key={title} className="glass-card" style={{ padding: '1rem 1.1rem' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>
                    {title}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text2)', lineHeight: 1.6 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="ticket-card" style={{ padding: 'clamp(1.1rem, 3vw, 1.7rem)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5c6f8f' }}>
                    Sample Journey
                  </div>
                  <h2 style={{ fontSize: '1.8rem', marginTop: '0.4rem' }}>Coach Companion Pass</h2>
                </div>
                <Ticket size={28} color="#20324f" />
              </div>

              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {[
                  ['Train', '12727 Hyderabad Express'],
                  ['Coach', 'S5 · Berth 23'],
                  ['Route', 'Hyderabad to Mumbai'],
                  ['State', 'Group ready · Protection available'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px dashed rgba(32,50,79,0.14)', paddingBottom: '0.65rem' }}>
                    <span style={{ color: '#6a7c99', fontSize: '0.82rem' }}>{label}</span>
                    <span style={{ fontWeight: 700, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 'clamp(1rem, 3vw, 1.6rem)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.8rem' }}>
                <BellRing size={18} color="var(--rail-gold)" />
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Built for common train moments</h3>
              </div>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {[
                  'Sleeping while your phone charges near the window seat',
                  'Finding the right people in your coach without exposing your identity',
                  'Helping a nearby traveler with a berth or food request',
                  'Keeping family informed during long overnight segments',
                ].map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 10, color: 'var(--text2)', lineHeight: 1.6 }}>
                    <ArrowRight size={15} color="var(--rail-gold)" style={{ marginTop: 4, flexShrink: 0 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="journey-features" className="container" style={{ padding: '2rem 1.5rem 5rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 2rem' }}>
          <div className="route-pill" style={{ justifyContent: 'center', marginBottom: '1rem' }}>Onboard Toolkit</div>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', marginBottom: '0.8rem' }}>
            More like a travel carriage, less like a generic dashboard
          </h2>
          <p style={{ color: 'var(--text2)', lineHeight: 1.8 }}>
            The product language is centered on trains, coaches, berths, route visibility, and passenger support so
            the experience feels grounded in the journey you are on.
          </p>
        </div>

        <div className="dashboard-grid">
          {features.map((feature) => (
            <div key={feature.title} className="card" style={{ padding: '1.5rem' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: feature.bg,
                  color: feature.color,
                  marginBottom: '1rem',
                }}
              >
                {feature.icon}
              </div>
              <h3 style={{ fontSize: '1.08rem', marginBottom: '0.45rem' }}>{feature.title}</h3>
              <p style={{ color: 'var(--text2)', lineHeight: 1.7, fontSize: '0.92rem' }}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 1.5rem 5rem' }}>
        <div className="container">
          <div className="rail-shell" style={{ padding: 'clamp(1.2rem, 4vw, 2.6rem)', textAlign: 'center' }}>
            <div className="route-pill" style={{ justifyContent: 'center', marginBottom: '1rem' }}>Departure Ready</div>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', marginBottom: '0.8rem' }}>
              Start with your next train, not a setup headache
            </h2>
            <p style={{ color: 'var(--text2)', maxWidth: 620, margin: '0 auto 1.8rem', lineHeight: 1.8 }}>
              Create an account, enter your journey, and let the app build your coach context around that trip.
            </p>
            <Link to="/auth?mode=register" className="btn btn-primary btn-lg">
              Begin Boarding
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          nav .container {
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
}
