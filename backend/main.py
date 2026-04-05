"""
JourneyGuard FastAPI Backend
- Firebase Auth JWT verification
- PNR lookup
- Journey group management
- Assistance requests
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
import uvicorn
import os

load_dotenv(override=True)

from routers import auth, journey, requests as req_router, pnr, location, protection, ai, admin

app = FastAPI(
    title="JourneyGuard API",
    description="Railway Group Travel & Assistance Platform",
    version="1.0.0-beta",
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
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
app.include_router(ai.router, prefix="/ai", tags=["AI"])
app.include_router(admin.router)


@app.on_event("startup")
async def startup_group_monitors():
    try:
        journey.resume_active_group_monitors()
    except Exception as exc:
        print(f"[WARN] Could not resume group monitors on startup: {exc}")


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
