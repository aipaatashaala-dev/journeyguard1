"""
JourneyGuard FastAPI Backend
- Firebase Auth JWT verification
- PNR lookup
- Journey group management
- Assistance requests
"""

import asyncio
import os

from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from dotenv import load_dotenv
import uvicorn

load_dotenv(override=True)

from dependencies import get_firebase_app
from routers import auth, journey, requests as req_router, pnr, location, protection, admin
from services.http_pool import close_shared_http_clients
from services.runtime_controls import TokenBucketLimiter

try:
    get_firebase_app()
except Exception as exc:
    print(f"[WARN] Firebase init failed during app startup: {exc}")

app = FastAPI(
    title="JourneyGuard API",
    description="Railway Group Travel & Assistance Platform",
    version="1.0.0-beta",
)
_request_limiter = TokenBucketLimiter(max_keys=20000)
_global_request_gate = asyncio.Semaphore(max(50, int(os.getenv("MAX_INFLIGHT_REQUESTS", "250"))))
_heavy_route_gate = asyncio.Semaphore(max(10, int(os.getenv("MAX_HEAVY_ROUTE_REQUESTS", "40"))))
_request_wait_timeout = max(0.1, float(os.getenv("REQUEST_WAIT_TIMEOUT_SECONDS", "4")))


def _traffic_policy(path: str) -> tuple[int, float, bool]:
    if path.startswith("/pnr") or path.startswith("/journey/train-info"):
        return 24, 0.8, True
    if path.startswith("/auth/register") or path.startswith("/auth/set-password"):
        return 10, 0.2, False
    if path.startswith("/auth/profile"):
        return 20, 0.5, False
    return 90, 4.0, False

frontend_url = os.getenv("FRONTEND_URL", "https://journeyguard.in").rstrip("/")
extra_cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("EXTRA_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
allow_origins = list(
    dict.fromkeys(
        [
            "http://localhost",
            "http://localhost:3000",
            "capacitor://localhost",
            "ionic://localhost",
            frontend_url,
            "https://journeyguard.in",
            "http://localhost:3000",
            "https://www.journeyguard.in",
            "https://journeyguard.web.app",
            "https://journeyguard.firebaseapp.com",
            "https://journeyguard1-1.onrender.com",
            *extra_cors_origins,
        ]
    )
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(pnr.router, prefix="/pnr", tags=["PNR"])
app.include_router(journey.router, prefix="/journey", tags=["Journey"])
app.include_router(req_router.router, prefix="/requests", tags=["Requests"])
app.include_router(location.router, prefix="/location", tags=["Location"])
app.include_router(protection.router, prefix="/protection", tags=["Protection"])
app.include_router(admin.router)


@app.middleware("http")
async def protect_api_under_load(request: Request, call_next):
    path = request.url.path
    if path in {"/", "/health", "/docs", "/openapi.json", "/redoc"}:
        return await call_next(request)

    client_host = (request.client.host if request.client else "unknown").strip() or "unknown"
    capacity, refill_per_second, heavy_route = _traffic_policy(path)
    allowed, retry_after = _request_limiter.allow(
        key=f"{client_host}:{path}",
        capacity=capacity,
        refill_per_second=refill_per_second,
    )
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many requests. Please retry in a moment.",
                "retry_after_seconds": round(retry_after, 2),
            },
            headers={"Retry-After": str(max(1, int(retry_after) + 1))},
        )

    acquired_global = False
    acquired_heavy = False
    try:
        await asyncio.wait_for(_global_request_gate.acquire(), timeout=_request_wait_timeout)
        acquired_global = True

        if heavy_route:
            await asyncio.wait_for(_heavy_route_gate.acquire(), timeout=_request_wait_timeout)
            acquired_heavy = True

        response = await call_next(request)
        response.headers["X-Load-Guard"] = "active"
        return response
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=503,
            content={"detail": "Server is busy. Please retry shortly."},
        )
    finally:
        if acquired_heavy:
            _heavy_route_gate.release()
        if acquired_global:
            _global_request_gate.release()


@app.on_event("startup")
async def startup_group_monitors():
    try:
        journey.resume_active_group_monitors()
    except Exception as exc:
        print(f"[WARN] Could not resume group monitors on startup: {exc}")


@app.on_event("shutdown")
async def shutdown_shared_clients():
    try:
        await close_shared_http_clients()
    except Exception as exc:
        print(f"[WARN] Could not close shared HTTP clients cleanly: {exc}")


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <html><body style="font-family:sans-serif;background:#080d1a;color:#eef2ff;padding:2rem;">
    <h1 style="color:#00e5c0">🛡️ JourneyGuard API</h1>
    <p>FastAPI Backend running · <a href="/docs" style="color:#3b8bff">API Docs →</a></p>
    </body></html>
    """


@app.get("/health")
async def health():
    return {"status": "ok", "service": "JourneyGuard API", "version": "1.0.0-beta"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
