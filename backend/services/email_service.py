"""
Email service for JourneyGuard
Sends location-sharing links and journey notifications.
Configure via environment variables:
    EMAIL_HOST      smtp.gmail.com
    EMAIL_PORT      587
    EMAIL_USER      your@gmail.com
    EMAIL_PASSWORD  your_app_password   (Gmail App Password)
    EMAIL_FROM      JourneyGuard <your@gmail.com>
    FRONTEND_URL    https://journeyguard.web.app
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

logger = logging.getLogger(__name__)

EMAIL_HOST     = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT     = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USER     = os.getenv("EMAIL_USER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
EMAIL_FROM     = os.getenv("EMAIL_FROM", f"JourneyGuard <{EMAIL_USER}>")
FRONTEND_URL   = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _send(to: str, subject: str, html_body: str) -> bool:
    """Low-level send via SMTP."""
    if not EMAIL_USER or not EMAIL_PASSWORD:
        logger.warning("Email credentials not configured – skipping send")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = EMAIL_FROM
        msg["To"]      = to
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_USER, to, msg.as_string())
        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


# ── Tracking link email ───────────────────────────────────────────────────────
def send_location_tracking_email(
    to_email: str,
    passenger_id: str,
    train_number: str,
    journey_date: str,
    tracking_link: str,
) -> bool:
    subject = f"🛡️ JourneyGuard – Live Location Tracking Started"
    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body {{ margin:0; padding:0; background:#080d1a; font-family:'Segoe UI',Arial,sans-serif; }}
    .wrapper {{ max-width:560px; margin:0 auto; padding:32px 16px; }}
    .card {{ background:#0f1829; border:1px solid rgba(255,255,255,0.07); border-radius:16px; overflow:hidden; }}
    .header {{ background:#0a3d2e; padding:28px 32px; text-align:center; }}
    .logo {{ display:inline-flex; align-items:center; gap:8px; }}
    .logo-icon {{ width:36px; height:36px; background:#00e5c0; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; font-size:18px; }}
    .logo-text {{ font-size:20px; font-weight:800; color:#00e5c0; }}
    .body {{ padding:28px 32px; }}
    h2 {{ color:#eef2ff; font-size:1.3rem; margin:0 0 8px; }}
    p {{ color:#94a3c4; font-size:0.9rem; line-height:1.65; margin:0 0 16px; }}
    .info-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0; }}
    .info-box {{ background:#172035; border-radius:10px; padding:12px; }}
    .info-label {{ font-size:0.7rem; color:#556080; text-transform:uppercase; letter-spacing:.08em; }}
    .info-value {{ font-size:0.95rem; font-weight:700; color:#00e5c0; margin-top:3px; }}
    .cta {{ display:block; background:#00e5c0; color:#080d1a; text-decoration:none; text-align:center;
            font-weight:800; font-size:1rem; padding:14px 24px; border-radius:10px; margin:20px 0; }}
    .link-box {{ background:#172035; border:1px solid rgba(0,229,192,0.15); border-radius:8px;
                 padding:10px 14px; font-size:0.78rem; color:#94a3c4; word-break:break-all; }}
    .warning {{ background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2);
                border-radius:8px; padding:12px; font-size:0.78rem; color:#f59e0b; margin-top:16px; }}
    .footer {{ padding:16px 32px; border-top:1px solid rgba(255,255,255,0.05); text-align:center; }}
    .footer p {{ font-size:0.72rem; color:#556080; margin:0; }}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="logo">
        <span class="logo-icon">🛡</span>
        <span class="logo-text">JourneyGuard</span>
      </div>
    </div>
    <div class="body">
      <h2>Live Location Tracking Active</h2>
      <p>Your location is now being shared in real-time. Use the link below to track your journey or share it with family & friends.</p>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">Passenger ID</div>
          <div class="info-value">{passenger_id}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Train</div>
          <div class="info-value">{train_number}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Journey Date</div>
          <div class="info-value">{journey_date}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Started</div>
          <div class="info-value">{datetime.now().strftime('%H:%M')}</div>
        </div>
      </div>

      <a href="{tracking_link}" class="cta">📍 Open Live Map</a>

      <p style="font-size:0.8rem;color:#556080;margin-bottom:6px;">Or copy this link:</p>
      <div class="link-box">{tracking_link}</div>

      <div class="warning">
        ⏱️ This link is active only during your journey. It will automatically expire when your journey ends or when you disable location sharing.
      </div>
    </div>
    <div class="footer">
      <p>JourneyGuard · Travel Protection Platform · This email was sent to {to_email}</p>
    </div>
  </div>
</div>
</body>
</html>
"""
    return _send(to_email, subject, html)


# ── Journey start notification ────────────────────────────────────────────────
def send_journey_start_email(
    to_email: str,
    passenger_id: str,
    train_number: str,
    coach: str,
    journey_date: str,
) -> bool:
    subject = f"🚂 JourneyGuard – Journey Started on Train {train_number}"
    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin:0; padding:0; background:#080d1a; font-family:'Segoe UI',Arial,sans-serif; }}
    .wrapper {{ max-width:540px; margin:0 auto; padding:32px 16px; }}
    .card {{ background:#0f1829; border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:28px 32px; }}
    h2 {{ color:#eef2ff; font-size:1.2rem; margin:0 0 8px; }}
    p {{ color:#94a3c4; font-size:0.88rem; line-height:1.65; margin:0 0 14px; }}
    .row {{ display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.88rem; }}
    .row span:first-child {{ color:#556080; }}
    .row span:last-child {{ color:#00e5c0; font-weight:700; }}
    .tip {{ background:rgba(0,229,192,0.06); border:1px solid rgba(0,229,192,0.15); border-radius:8px; padding:12px; font-size:0.8rem; color:#94a3c4; margin-top:16px; }}
    .footer {{ margin-top:20px; text-align:center; font-size:0.72rem; color:#556080; }}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <h2>🚂 Journey Started</h2>
    <p>You have successfully joined your train group on JourneyGuard.</p>
    <div class="row"><span>Passenger ID</span><span>{passenger_id}</span></div>
    <div class="row"><span>Train</span><span>{train_number}</span></div>
    <div class="row"><span>Coach</span><span>{coach}</span></div>
    <div class="row"><span>Date</span><span>{journey_date}</span></div>
    <div class="tip">💡 Enable Protection Mode and Location Sharing from your dashboard for full security coverage during travel.</div>
    <div class="footer">JourneyGuard · {to_email}</div>
  </div>
</div>
</body>
</html>
"""
    return _send(to_email, subject, html)


# ── Journey end notification ──────────────────────────────────────────────────
def send_journey_end_email(to_email: str, passenger_id: str, train_number: str) -> bool:
    subject = f"✅ JourneyGuard – Journey Ended | Location Link Expired"
    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin:0; padding:0; background:#080d1a; font-family:'Segoe UI',Arial,sans-serif; }}
    .wrapper {{ max-width:540px; margin:0 auto; padding:32px 16px; }}
    .card {{ background:#0f1829; border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:28px 32px; text-align:center; }}
    .icon {{ font-size:3rem; margin-bottom:1rem; }}
    h2 {{ color:#eef2ff; font-size:1.2rem; margin:0 0 8px; }}
    p {{ color:#94a3c4; font-size:0.88rem; line-height:1.65; }}
    .badge {{ display:inline-block; background:rgba(16,217,138,0.1); color:#10d98a; border:1px solid rgba(16,217,138,0.25); padding:5px 14px; border-radius:50px; font-size:0.78rem; font-weight:700; margin:12px 0; }}
    .footer {{ margin-top:20px; font-size:0.72rem; color:#556080; }}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="icon">🏁</div>
    <h2>Journey Completed</h2>
    <div class="badge">✓ Location Link Expired</div>
    <p>Your journey on Train {train_number} has ended. Your live location tracking link has been automatically deactivated and is no longer accessible.</p>
    <p style="margin-top:12px;">Thank you for travelling with JourneyGuard, {passenger_id}.</p>
    <div class="footer">JourneyGuard · {to_email}</div>
  </div>
</div>
</body>
</html>
"""
    return _send(to_email, subject, html)


def send_admin_otp_email(to_email: str, otp: str, expires_minutes: int = 10) -> bool:
    subject = "JourneyGuard Admin OTP"
    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin:0; padding:0; background:#080d1a; font-family:'Segoe UI',Arial,sans-serif; }}
    .wrapper {{ max-width:540px; margin:0 auto; padding:32px 16px; }}
    .card {{ background:#0f1829; border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:28px 32px; }}
    h2 {{ color:#eef2ff; font-size:1.25rem; margin:0 0 10px; }}
    p {{ color:#94a3c4; font-size:0.9rem; line-height:1.65; margin:0 0 14px; }}
    .otp {{ margin:20px 0; padding:16px; border-radius:12px; background:#172035; text-align:center; font-size:2rem; letter-spacing:.35em; font-weight:800; color:#00e5c0; }}
    .note {{ background:rgba(0,229,192,0.06); border:1px solid rgba(0,229,192,0.15); border-radius:8px; padding:12px; font-size:0.8rem; color:#94a3c4; margin-top:16px; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <h2>JourneyGuard Admin Login</h2>
      <p>Use the one-time password below to complete your admin sign in.</p>
      <div class="otp">{otp}</div>
      <p>This OTP expires in {expires_minutes} minutes.</p>
      <div class="note">If you did not request this code, you can ignore this email.</div>
    </div>
  </div>
</body>
</html>
"""
    return _send(to_email, subject, html)
