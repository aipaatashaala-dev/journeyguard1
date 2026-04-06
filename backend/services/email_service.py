"""
Email service for JourneyGuard.

SMTP configuration is read from environment variables:
    EMAIL_HOST
    EMAIL_PORT
    EMAIL_USER
    EMAIL_PASSWORD
    EMAIL_FROM
"""

import logging
import os
import smtplib
import ssl
from datetime import datetime
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from html import escape

logger = logging.getLogger(__name__)


def _email_settings() -> dict:
    email_user = os.getenv("EMAIL_USER", "").strip()
    return {
        "host": os.getenv("EMAIL_HOST", "smtp.gmail.com").strip() or "smtp.gmail.com",
        "port": int(os.getenv("EMAIL_PORT", 587) or 587),
        "user": email_user,
        "password": os.getenv("EMAIL_PASSWORD", ""),
        "from_header": os.getenv("EMAIL_FROM", f"JourneyGuard <{email_user}>").strip() or f"JourneyGuard <{email_user}>",
    }


def _normalized_email(value: str | None) -> str:
    return parseaddr(str(value or "").strip())[1].strip()


def _formatted_from_header(from_header: str, fallback_email: str) -> str:
    display_name, email_address = parseaddr(from_header)
    safe_display_name = Header(display_name or "JourneyGuard", "utf-8").encode()
    return formataddr((safe_display_name, email_address or fallback_email))


def _render_email(
    *,
    title: str,
    intro: str,
    details: list[tuple[str, str]] | None = None,
    note: str | None = None,
    cta_label: str | None = None,
    cta_href: str | None = None,
    footer: str | None = None,
) -> str:
    rows = ""
    for label, value in details or []:
        rows += (
            "<div class='row'>"
            f"<span>{escape(str(label))}</span>"
            f"<strong>{escape(str(value))}</strong>"
            "</div>"
        )

    note_html = f"<div class='note'>{escape(note)}</div>" if note else ""
    footer_html = f"<div class='footer'>{escape(footer)}</div>" if footer else ""
    cta_html = ""
    if cta_label and cta_href:
        safe_href = escape(cta_href, quote=True)
        cta_html = (
            f"<a class='cta' href='{safe_href}' target='_blank' rel='noopener noreferrer'>"
            f"{escape(cta_label)}</a>"
            f"<div class='link'>{escape(cta_href)}</div>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{
      margin: 0;
      padding: 24px 12px;
      background: #080d1a;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #e5ecff;
    }}
    .wrapper {{
      max-width: 560px;
      margin: 0 auto;
    }}
    .card {{
      background: #0f1829;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 28px 24px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
    }}
    .brand {{
      font-size: 12px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #00e5c0;
      font-weight: 700;
      margin-bottom: 14px;
    }}
    h1 {{
      margin: 0 0 10px;
      font-size: 24px;
      color: #f7faff;
    }}
    p {{
      margin: 0 0 16px;
      font-size: 14px;
      line-height: 1.7;
      color: #9bb0d1;
    }}
    .row {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 14px;
    }}
    .row span {{
      color: #6d7f9c;
    }}
    .row strong {{
      color: #00e5c0;
      text-align: right;
      font-weight: 700;
    }}
    .cta {{
      display: block;
      margin: 20px 0 10px;
      padding: 14px 18px;
      border-radius: 12px;
      background: #00e5c0;
      color: #08101d !important;
      text-align: center;
      font-weight: 800;
      text-decoration: none;
    }}
    .link {{
      background: #162237;
      border: 1px solid rgba(0, 229, 192, 0.18);
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.6;
      color: #a7b8d5;
      word-break: break-all;
    }}
    .note {{
      margin-top: 18px;
      border-radius: 12px;
      padding: 14px;
      background: rgba(0, 229, 192, 0.07);
      border: 1px solid rgba(0, 229, 192, 0.18);
      font-size: 13px;
      line-height: 1.6;
      color: #c6d5f0;
    }}
    .footer {{
      margin-top: 18px;
      font-size: 12px;
      color: #667792;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="brand">JourneyGuard</div>
      <h1>{escape(title)}</h1>
      <p>{escape(intro)}</p>
      {rows}
      {cta_html}
      {note_html}
      {footer_html}
    </div>
  </div>
</body>
</html>
"""


def _send(to: str, subject: str, html_body: str) -> bool:
    settings = _email_settings()
    recipient = _normalized_email(to)
    email_user = settings["user"]
    email_password = settings["password"]
    email_from = _formatted_from_header(settings["from_header"], email_user)
    email_host = settings["host"]
    email_port = settings["port"]

    if not recipient:
        logger.warning("Email send skipped because recipient address is missing")
        return False

    if not email_user or not email_password:
        logger.warning("Email credentials not configured; skipping send to %s", recipient)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = Header(subject, "utf-8").encode()
        msg["From"] = email_from
        msg["To"] = recipient
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        tls_context = ssl.create_default_context()
        if email_port == 465:
            with smtplib.SMTP_SSL(email_host, email_port, timeout=20, context=tls_context) as server:
                server.ehlo()
                server.login(email_user, email_password)
                server.sendmail(email_user, [recipient], msg.as_string())
        else:
            with smtplib.SMTP(email_host, email_port, timeout=20) as server:
                server.ehlo()
                server.starttls(context=tls_context)
                server.ehlo()
                server.login(email_user, email_password)
                server.sendmail(email_user, [recipient], msg.as_string())

        logger.info("Email sent to %s: %s", recipient, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s: %s", recipient, subject)
        return False


def send_location_tracking_email(
    to_email: str,
    passenger_id: str,
    train_number: str,
    journey_date: str,
    tracking_link: str,
) -> bool:
    subject = f"JourneyGuard | Live Location Tracking Started for Train {train_number}"
    html = _render_email(
        title="Live Location Tracking Started",
        intro=(
            "Your live location sharing is now active. Open the tracking link below "
            "to follow the journey or share it with family and friends."
        ),
        details=[
            ("Passenger ID", passenger_id),
            ("Train", train_number),
            ("Journey Date", journey_date),
            ("Started At", datetime.now().strftime("%H:%M")),
        ],
        cta_label="Open Live Map",
        cta_href=tracking_link,
        note=(
            "This link stays active only while the journey is in progress. "
            "JourneyGuard expires it automatically when the trip ends or location sharing is turned off."
        ),
        footer=f"Sent to {to_email}",
    )
    return _send(to_email, subject, html)


def send_journey_start_email(
    to_email: str,
    passenger_id: str,
    train_number: str,
    coach: str,
    journey_date: str,
) -> bool:
    subject = f"JourneyGuard | Journey Started on Train {train_number}"
    html = _render_email(
        title="Journey Started",
        intro="You have successfully joined your train group on JourneyGuard.",
        details=[
            ("Passenger ID", passenger_id),
            ("Train", train_number),
            ("Coach", coach),
            ("Journey Date", journey_date),
        ],
        note=(
            "Enable Protection Mode and Location Sharing from your dashboard "
            "for full coverage during travel."
        ),
        footer=f"Sent to {to_email}",
    )
    return _send(to_email, subject, html)


def send_journey_end_email(to_email: str, passenger_id: str, train_number: str) -> bool:
    subject = f"JourneyGuard | Journey Completed for Train {train_number}"
    html = _render_email(
        title="Journey Completed",
        intro=(
            f"Your journey on train {train_number} has been marked as completed, "
            "and the live location link has been expired."
        ),
        details=[
            ("Passenger ID", passenger_id),
            ("Train", train_number),
        ],
        note="Thank you for travelling with JourneyGuard.",
        footer=f"Sent to {to_email}",
    )
    return _send(to_email, subject, html)


def send_admin_otp_email(to_email: str, otp: str, expires_minutes: int = 10) -> bool:
    subject = "JourneyGuard | Admin OTP"
    html = _render_email(
        title="Admin Sign In OTP",
        intro="Use the one-time password below to complete your JourneyGuard admin sign in.",
        details=[
            ("OTP", otp),
            ("Expires In", f"{expires_minutes} minutes"),
        ],
        note="If you did not request this code, you can safely ignore this email.",
        footer=f"Sent to {to_email}",
    )
    return _send(to_email, subject, html)
