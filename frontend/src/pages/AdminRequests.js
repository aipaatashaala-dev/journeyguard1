import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { clearAdminSession, getAdminRequests, resolveAdminRequest } from '../utils/adminApi';

const REQ_TYPES = [
  { id: 'MEDICAL', label: 'Medical Help', color: 'var(--danger)' },
  { id: 'FOOD', label: 'Food Sharing', color: 'var(--accent3)' },
  { id: 'FOOD_NEED', label: 'Need Food', color: 'var(--accent3)' },
  { id: 'FOOD_HAS', label: 'Food Available', color: 'var(--success)' },
  { id: 'BERTH', label: 'Berth Exchange', color: 'var(--accent2)' },
  { id: 'EMERGENCY', label: 'Emergency Alert', color: 'var(--danger)' },
  { id: 'AI', label: 'AI Message', color: '#3657c8' },
  { id: 'SYSTEM', label: 'Journey Update', color: '#3657c8' },
];

export default function AdminRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = async () => {
    try {
      const res = await getAdminRequests();
      setRequests(res.data);
    } catch (error) {
      clearAdminSession();
      toast.error(error?.response?.data?.detail || 'Could not load requests');
      navigate('/admin', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const resolveRequest = async (request) => {
    try {
      await resolveAdminRequest(request.group_id, request.id);
      toast.success('Request resolved');
      loadRequests();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to resolve request');
    }
  };

  const getReqType = (type) => REQ_TYPES.find((item) => item.id === type) || { label: type || 'Request', color: 'var(--text2)' };

  return (
    <div className="page-shell">
      <div className="container section-stack" style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/admin/dashboard" className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <div>
            <div className="section-label">Administration</div>
            <h1>Assistance Requests</h1>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text2)' }}>Loading requests...</p>
          </div>
        ) : (
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem' }}>Pending Requests ({requests.length})</h3>

            {requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>No pending requests</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {requests.map((req) => {
                  const rt = getReqType(req.type);
                  return (
                    <div key={req.id} className="responsive-list-item" style={{ padding: '1rem', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${rt.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AlertTriangle size={20} color={rt.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rt.label}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                            {req.passenger_id} · Group: {req.group_id}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: '0.25rem' }}>
                            {formatDistanceToNow(req.timestamp, { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      <div className="responsive-actions">
                        <button onClick={() => resolveRequest(req)} className="btn btn-primary btn-sm">
                          <CheckCircle size={14} />
                          Resolve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
