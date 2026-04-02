# � JourneyGuard — Railway Group Travel Platform

React JS + FastAPI + Firebase · Indian Railways · Group Journey Management

---

## 📁 Project Structure

```
journeyguard/
├── frontend/                   # React JS app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.js         # Public marketing page
│   │   │   ├── AuthPage.js            # Register / Login
│   │   │   ├── DashboardPage.js       # Main hub
│   │   │   ├── JourneyPage.js         # PNR entry + group join
│   │   │   ├── GroupPage.js           # Coach group + requests
│   │   │   └── SettingsPage.js        # User settings
│   │   ├── components/
│   │   │   ├── MainLayout.js
│   │   │   ├── Sidebar.js
│   │   │   ├── Navbar.js
│   │   │   └── BerthSelectionModal.js
│   │   ├── context/
│   │   │   └── AuthContext.js         # Firebase Auth context
│   │   ├── utils/
│   │   │   └── api.js                 # Axios wrapper → FastAPI
│   │   ├── firebase.js
│   │   └── App.js
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── backend/                    # FastAPI app
│   ├── main.py                        # App entry + CORS
│   ├── dependencies.py                # Firebase JWT verification
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── models/
│   │   └── schemas.py                 # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py                    # /auth/register, /auth/me
│   │   ├── pnr.py                     # /pnr/{pnr}
│   │   ├── journey.py                 # /journey/join, /leave
│   │   └── requests.py                # /requests (assistance CRUD)
│   └── services/
│       ├── pnr_service.py             # Railway API + mock fallback
│       └── email_service.py           # SMTP email templates
│
├── firebase-database-rules.json
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

### 1. Firebase Setup

1. Go to https://console.firebase.google.com
2. Create project `journeyguard`
3. Enable **Authentication → Email/Password**
4. Enable **Realtime Database** → start in test mode
5. Set database URL: `https://journeyguard-default-rtdb.firebaseio.com/`
6. Paste `firebase-database-rules.json` → Database → Rules
7. Download **Service Account JSON**:
   Project Settings → Service Accounts → Generate New Private Key
   → Save as `backend/firebase-credentials.json`
8. Copy **Web App config** from Project Settings → Web Apps
   → fill into `frontend/.env`

### 2. Backend Setup

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Place your firebase-credentials.json here
cp ~/Downloads/your-service-account.json firebase-credentials.json

uvicorn main:app --reload --port 8000
# API Docs: http://localhost:8000/docs
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Fill in Firebase web config values from Firebase Console

npm start
# Opens http://localhost:3000
```

### 4. Docker (Full Stack)

```bash
# From project root
docker-compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

---

## 🔑 Key Features

### Journey Groups
| Feature | Description |
|---------|-------------|
| PNR Lookup | Enter PNR to get train/coach/berth details |
| Join Group | Join group by train number + date + coach + berth |
| Group Chat | Real-time messages with coach group members |
| Assistance Requests | MEDICAL, FOOD, BERTH, EMERGENCY request types |
        passenger_id: "Passenger S5-23"
        coach: "S5"
        berth: "23"
      requests/
        {reqId}/
          type: MEDICAL | FOOD | BERTH | EMERGENCY
          passenger_id: "Passenger S5-23"

locations/
  12727_2026-03-20/
    lat: 17.3850
    lng: 78.4867
    passenger_id: "Passenger S5-23"
    active: true
    expired: false
    token: "eyJ..."
```

---

## 🌐 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ✗ | Create account |
| GET | `/auth/me` | ✓ | Get profile |
| GET | `/pnr/{pnr}` | ✓ | Fetch journey by PNR |
| POST | `/journey/join` | ✓ | Join train group |
| POST | `/journey/{id}/leave` | ✓ | Leave + expire location |
| PUT | `/journey/{id}/seat` | ✓ | Update coach/berth |
| POST | `/location/start` | ✓ | Start tracking + send email |
| POST | `/location/update` | ✓ | Push GPS coords |
| POST | `/location/{id}/stop` | ✓ | Stop + expire link |
| GET | `/location/{id}/link` | ✓ | Get current tracking link |
| POST | `/requests` | ✓ | Send assistance request |
| GET | `/requests/{jid}/{cid}` | ✓ | List coach requests |
| DELETE | `/requests/{jid}/{cid}/{rid}` | ✓ | Delete own request |

All protected routes require `Authorization: Bearer <Firebase ID Token>`

---

## 🔒 Privacy & Security

- Passengers appear only as `Passenger S5-23` — no name, no phone shared
- Firebase Auth handles password hashing (bcrypt) — never stored in DB
- Location tokens are HMAC-SHA256 signed with a server secret
- Location links auto-expire on journey end
- Groups auto-expire after journey (implement Cloud Function TTL cleanup)
- Database rules enforce per-user write access

---

## 📧 Email Notifications Sent

| Trigger | Email |
|---------|-------|
| Journey start (group join) | Welcome + journey details |
| Location sharing ON | Tracking link + live map button |
| Location sharing OFF / Journey end | Link expired notification |
