import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MessageCircle, Phone, TrainFront, LifeBuoy } from 'lucide-react';

const contactCards = [
  {
    icon: <Mail size={22} color="var(--accent)" />,
    title: 'Email Support',
    desc: 'Best for account issues, journey corrections, and follow-up help.',
    action: 'journeyguard@zohomail.in',
    href: 'mailto:journeyguard@zohomail.in',
  },
  {
    icon: <Phone size={22} color="var(--rail-gold)" />,
    title: 'Phone Support',
    desc: 'Use this when you need immediate help during a live trip.',
    action: '+1 (800) JOURNEY',
    href: 'tel:+1-800-JOURNEY',
  },
  {
    icon: <MessageCircle size={22} color="var(--accent2)" />,
    title: 'Live Chat',
    desc: 'A lightweight support lane for quick product questions.',
    action: 'Open support chat',
    href: '#',
  },
];

export default function ContactPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1.5rem' }}>
      <div className="container" style={{ display: 'grid', gap: '1.5rem' }}>
        <div className="rail-shell" style={{ padding: 'clamp(1.15rem, 3vw, 2rem)' }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--text2)', marginBottom: '1rem' }}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>

          <div className="route-pill" style={{ marginBottom: '1rem' }}>
            <TrainFront size={14} />
            Official Support
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', marginBottom: '0.8rem' }}>
            Support that fits the pace of a real journey.
          </h1>
          <p style={{ color: 'var(--text2)', maxWidth: 700, lineHeight: 1.8 }}>
            When something goes wrong during travel, the contact surface should feel calm and direct. This page is
            designed to look more like a support cabin than a generic FAQ page.
          </p>
        </div>

        <div className="dashboard-grid">
          {contactCards.map((card) => (
            <a
              key={card.title}
              href={card.href}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit', padding: '1.5rem' }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface2)',
                  marginBottom: '1rem',
                }}
              >
                {card.icon}
              </div>
              <h3 style={{ fontSize: '1.12rem', marginBottom: '0.45rem' }}>{card.title}</h3>
              <p style={{ color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1rem' }}>{card.desc}</p>
              <div style={{ color: 'var(--rail-gold)', fontWeight: 700 }}>{card.action}</div>
            </a>
          ))}
        </div>

        <div className="split-grid">
          <div className="ticket-card" style={{ padding: 'clamp(1.1rem, 3vw, 1.6rem)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
              <LifeBuoy size={20} color="#20324f" />
              <h2 style={{ fontSize: '1.6rem', margin: 0 }}>When should I use which channel?</h2>
            </div>
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <div>
                <strong>Email</strong>
                <div style={{ lineHeight: 1.7 }}>Best for anything that needs screenshots, account history, or explanation.</div>
              </div>
              <div>
                <strong>Phone</strong>
                <div style={{ lineHeight: 1.7 }}>Best during travel when you need fast help and do not want to type much.</div>
              </div>
              <div>
                <strong>Live chat</strong>
                <div style={{ lineHeight: 1.7 }}>Best for short questions about features, setup, or where to find something.</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
            <h3 style={{ marginBottom: '0.9rem' }}>Travel-focused help</h3>
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {[
                'Coach group not opening after join',
                'Wrong berth or train details after PNR fetch',
                'Need to update contact details before departure',
                'A fellow traveler cannot see the shared support flow',
              ].map((item) => (
                <div key={item} style={{ padding: '0.85rem 1rem', borderRadius: 14, background: 'var(--surface2)', color: 'var(--text2)' }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
