"""
Shared dependencies: Firebase JWT verification, DB access.
"""
import base64
import json
import os
import time
from pathlib import Path
from fastapi import Header, HTTPException, status
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth as fb_auth, db as fb_db
from services.runtime_controls import TTLCache

# ── Firebase Admin init ──────────────────────────────────────────────────────
_BASE_DIR = Path(__file__).resolve().parent
_DEFAULT_FIREBASE_CREDENTIALS_PATH = _BASE_DIR / "firebase-credentials.json"
load_dotenv(dotenv_path=_BASE_DIR / ".env", override=False)

_firebase_app = None
_verified_token_cache = TTLCache(max_size=4096)


def _decode_unverified_token(token: str) -> dict:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return {}
        payload = parts[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return {}


def _dev_bypass_enabled() -> bool:
    return os.getenv("ALLOW_DEV_AUTH_BYPASS", "").strip().lower() in {"1", "true", "yes"}


def _resolve_credentials_path(raw_path: str | None) -> Path:
    candidate = Path(raw_path).expanduser() if raw_path else _DEFAULT_FIREBASE_CREDENTIALS_PATH
    if not candidate.is_absolute():
        candidate = (_BASE_DIR / candidate).resolve()
    return candidate


def get_firebase_app():
    global _firebase_app
    if _firebase_app is None:
        try:
            _firebase_app = firebase_admin.get_app()
            return _firebase_app
        except ValueError:
            pass

        database_url = os.getenv("FIREBASE_DATABASE_URL", "https://journeyguard-default-rtdb.firebaseio.com/")
        firebase_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()

        if firebase_json:
            try:
                service_account_info = json.loads(firebase_json)
            except json.JSONDecodeError:
                try:
                    decoded = base64.b64decode(firebase_json).decode("utf-8")
                    service_account_info = json.loads(decoded)
                except Exception as err:
                    raise ValueError("FIREBASE_CREDENTIALS_JSON must be valid JSON or base64-encoded JSON") from err
            cred = credentials.Certificate(service_account_info)
        else:
            cred_path = _resolve_credentials_path(os.getenv("FIREBASE_CREDENTIALS_PATH"))
            if not cred_path.exists():
                raise FileNotFoundError(
                    "Firebase credentials file not found. "
                    "Set FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_PATH."
                )
            cred = credentials.Certificate(str(cred_path))

        _firebase_app = firebase_admin.initialize_app(cred, {
            "databaseURL": database_url
        })
    return _firebase_app

# Call on import so the app initialises once
try:
    get_firebase_app()
except Exception as e:
    print(f"[WARN] Firebase init skipped in test mode: {e}")

# ── Auth dependency ──────────────────────────────────────────────────────────
async def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Verify the Firebase ID token from Authorization: Bearer <token>
    Returns decoded token dict with 'uid', 'email', etc.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]

    cached_user = _verified_token_cache.get(token)
    if cached_user:
        exp = int(cached_user.get("exp", 0) or 0)
        if exp <= int(time.time()) + 15:
            _verified_token_cache.pop(token, None)
        else:
            return cached_user

    try:
        get_firebase_app()
    except Exception as e:
        if _dev_bypass_enabled():
            payload = _decode_unverified_token(token)
            dev_user = {
                "uid": payload.get("user_id") or payload.get("uid") or payload.get("sub") or os.getenv("DEV_AUTH_UID", "local-dev-user"),
                "email": payload.get("email") or os.getenv("DEV_AUTH_EMAIL", "localdev@journeyguard.local"),
                "name": payload.get("name"),
                "auth_bypassed": True,
            }
            print(f"[WARN] Firebase auth bypass enabled. Using local dev identity: {dev_user['uid']}")
            return dev_user

        raise HTTPException(
            status_code=503,
            detail=(
                "Firebase admin is not configured on the server. "
                "Set FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_PATH."
            ),
        )

    try:
        decoded = fb_auth.verify_id_token(token)
        exp = int(decoded.get("exp", 0) or 0)
        ttl_seconds = min(240, max(15, exp - int(time.time()) - 15)) if exp else 60
        _verified_token_cache.set(token, decoded, ttl_seconds=ttl_seconds)
        return decoded
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except fb_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        error_text = str(e)

        if _dev_bypass_enabled():
            payload = _decode_unverified_token(token)
            dev_user = {
                "uid": payload.get("user_id") or payload.get("uid") or payload.get("sub") or os.getenv("DEV_AUTH_UID", "local-dev-user"),
                "email": payload.get("email") or os.getenv("DEV_AUTH_EMAIL", "localdev@journeyguard.local"),
                "name": payload.get("name"),
                "auth_bypassed": True,
            }
            print(f"[WARN] Firebase auth bypass enabled. Using local dev identity: {dev_user['uid']}")
            return dev_user

        if "www.googleapis.com" in error_text or "getaddrinfo failed" in error_text or "NameResolutionError" in error_text:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Firebase token verification could not reach Google. "
                    "Check internet/DNS access, or set ALLOW_DEV_AUTH_BYPASS=true for local development."
                ),
            )

        raise HTTPException(status_code=401, detail=f"Auth error: {error_text}")

# ── Firebase DB helper ───────────────────────────────────────────────────────
def get_db():
    get_firebase_app()
    return fb_db
