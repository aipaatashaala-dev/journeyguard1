import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './components/MainLayout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import JourneyPage from './pages/JourneyPage';
import GroupPage from './pages/GroupPage';
import MyGroupPage from './pages/MyGroupPage';
import JoinGroupPage from './pages/JoinGroupPage';
import SettingsPage from './pages/SettingsPage';
import ContactPage from './pages/ContactPage';
import LocationSharePage from './pages/LocationSharePage';
import ProtectionPage from './pages/ProtectionPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminJourneys from './pages/AdminJourneys';
import AdminLocations from './pages/AdminLocations';
import AdminRequests from './pages/AdminRequests';
import { hasValidAdminSession } from './utils/adminApi';
import CookieBanner from './components/CookieBanner';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/auth" replace />;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  return !user ? children : <Navigate to="/dashboard" replace />;
}

function AdminRoute({ children }) {
  return hasValidAdminSession() ? children : <Navigate to="/admin" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
      <Route path="/track/:token" element={<LocationSharePage />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
      <Route path="/admin/journeys" element={<AdminRoute><AdminJourneys /></AdminRoute>} />
      <Route path="/admin/locations" element={<AdminRoute><AdminLocations /></AdminRoute>} />
      <Route path="/admin/requests" element={<AdminRoute><AdminRequests /></AdminRoute>} />
      
      {/* Protected Routes with Sidebar */}
      <Route path="/dashboard" element={<PrivateRoute><MainLayout><DashboardPage /></MainLayout></PrivateRoute>} />
      <Route path="/journey" element={<PrivateRoute><MainLayout><JourneyPage /></MainLayout></PrivateRoute>} />
      <Route path="/group" element={<PrivateRoute><MainLayout><MyGroupPage /></MainLayout></PrivateRoute>} />
      <Route path="/group/join" element={<PrivateRoute><MainLayout><JoinGroupPage /></MainLayout></PrivateRoute>} />
      <Route path="/group/:journeyId/:coachId" element={<PrivateRoute><MainLayout><GroupPage /></MainLayout></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><MainLayout><SettingsPage /></MainLayout></PrivateRoute>} />
      <Route path="/contact" element={<PrivateRoute><MainLayout><ContactPage /></MainLayout></PrivateRoute>} />
      <Route path="/protection" element={<PrivateRoute><MainLayout><ProtectionPage /></MainLayout></PrivateRoute>} />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <CookieBanner />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#ffffff',
              color: '#4c2a14',
              border: '1px solid rgba(181,102,24,0.12)',
              fontFamily: "'Outfit', sans-serif",
              fontSize: '0.88rem',
              boxShadow: '0 16px 35px rgba(160, 98, 39, 0.14)',
            },
            success: { iconTheme: { primary: '#1f9d72', secondary: '#ffffff' } },
            error: { iconTheme: { primary: '#df4f68', secondary: '#ffffff' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
