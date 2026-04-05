"""
Location tracking service
- Writes live GPS coords to Firebase Realtime DB
- Generates tamper-proof share tokens
- Expires tokens when journey ends
"""
import os
import base64
import json
import time
import hmac
import hashlib
import ipaddress
from urllib.parse import urlparse
from firebase_admin import db as fb_db

DEFAULT_FRONTEND_URL = "https://journeyguard.in"
_SECRET        = os.getenv("LOCATION_TOKEN_SECRET", "journeyguard-secret-change-me")
_LOCAL_HOSTS   = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


# ── Token helpers ─────────────────────────────────────────────────────────────
def _sign(payload: str) -> str:
    sig = hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return sig


def generate_tracking_token(journey_id: str, uid: str) -> str:
    """
    Create a signed, URL-safe token encoding journey_id + uid + timestamp.
    """
    payload = {"j": journey_id, "u": uid, "t": int(time.time())}
    raw     = json.dumps(payload, separators=(",", ":"))
    encoded = base64.urlsafe_b64encode(raw.encode()).decode()
    sig     = _sign(encoded)
    return f"{encoded}.{sig}"


def verify_tracking_token(token: str) -> dict | None:
    """Returns decoded payload or None if invalid/expired."""
    try:
        encoded, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, _sign(encoded)):
            return None
        payload = json.loads(base64.urlsafe_b64decode(encoded + "==").decode())
        # Tokens older than 72 h are considered expired
        if time.time() - payload["t"] > 72 * 3600:
            return None
        return payload
    except Exception:
        return None


def _normalize_url(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().rstrip("/")


def _is_local_url(value: str) -> bool:
    try:
        host = urlparse(value).hostname or ""
    except Exception:
        return False

    if host in _LOCAL_HOSTS or host.endswith(".localhost"):
        return True

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False

    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved


def _origin_from_request(request) -> str:
    if not request:
        return ""

    for header_name in ("origin", "referer"):
        raw_value = request.headers.get(header_name)
        if not raw_value:
            continue

        parsed = urlparse(raw_value)
        if not parsed.scheme or not parsed.netloc:
            continue

        candidate = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
        if not _is_local_url(candidate):
            return candidate

    return ""


def resolve_frontend_url(request=None) -> str:
    configured = _normalize_url(os.getenv("FRONTEND_URL", ""))
    if configured and not _is_local_url(configured):
        return configured

    request_origin = _origin_from_request(request)
    if request_origin:
        return request_origin

    if configured:
        return configured

    return DEFAULT_FRONTEND_URL


def tracking_link_for_token(token: str, request=None) -> str:
    return f"{resolve_frontend_url(request)}/track/{token}"


# ── Firebase writes ───────────────────────────────────────────────────────────
def start_location_session(journey_id: str, uid: str, meta: dict) -> str:
    """
    Create /locations/{journey_id} node with metadata.
    Returns the tracking token.
    """
    expires_at = int((time.time() + 3600) * 1000)
    token = generate_tracking_token(journey_id, uid)
    fb_db.reference(f"locations/{journey_id}").set({
        **meta,
        "token"      : token,
        "active"     : True,
        "started_at" : int(time.time() * 1000),
        "updated_at" : int(time.time() * 1000),
        "expires_at" : expires_at,
        "expired"    : False,
        "lat"        : None,
        "lng"        : None,
        "accuracy"   : None,
    })
    return token


def update_location_in_db(journey_id: str, lat: float, lng: float, accuracy: float | None):
    fb_db.reference(f"locations/{journey_id}").update({
        "lat"       : lat,
        "lng"       : lng,
        "accuracy"  : accuracy,
        "updated_at": int(time.time() * 1000),
    })


def expire_location_session(journey_id: str):
    """Mark the location session as expired so the public map shows the correct state."""
    fb_db.reference(f"locations/{journey_id}").update({
        "active" : False,
        "expired": True,
    })


def get_location_data(journey_id: str) -> dict | None:
    snap = fb_db.reference(f"locations/{journey_id}").get()
    if snap and not snap.get("expired") and snap.get("expires_at") and int(time.time() * 1000) >= snap.get("expires_at"):
        expire_location_session(journey_id)
        snap["expired"] = True
        snap["active"] = False
    return snap
