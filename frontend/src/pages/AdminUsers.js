import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Search, Trash2, Users } from 'lucide-react';
import { clearAdminSession, deleteAdminUser, getAdminUsers } from '../utils/adminApi';

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const res = await getAdminUsers();
      setUsers(res.data);
    } catch (error) {
      clearAdminSession();
      toast.error(error?.response?.data?.detail || 'Could not load users');
      navigate('/admin', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const removeUser = async (user) => {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    try {
      await deleteAdminUser(user.uid);
      toast.success('User deleted');
      loadUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to delete user');
    }
  };

  const filteredUsers = users.filter((item) =>
    item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.uid?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-shell">
      <div className="container section-stack" style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/admin/dashboard" className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <div>
            <div className="section-label">Administration</div>
            <h1>Manage Users</h1>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Search size={18} color="var(--text2)" />
            <input
              type="text"
              placeholder="Search by email or uid..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem', color: 'var(--text2)' }}>Loading users...</p>
          </div>
        ) : (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3>Users ({filteredUsers.length})</h3>
              <div className="action-chip" style={{ cursor: 'default' }}>
                <Users size={14} />
                Backend verified
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>No users found</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {filteredUsers.map((item) => (
                  <div key={item.uid} className="responsive-list-item" style={{ padding: '1rem', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.email}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginTop: '0.25rem' }}>UID: {item.uid}</div>
                      {item.mobile_number && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text2)', marginTop: '0.25rem' }}>
                          Mobile: {item.mobile_number}
                        </div>
                      )}
                      {(item.active_group_id || item.active_coach_id || item.passenger_id) && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                          {item.passenger_id && (
                            <span className="action-chip" style={{ cursor: 'default' }}>{item.passenger_id}</span>
                          )}
                          {item.active_group_id && (
                            <span className="action-chip" style={{ cursor: 'default' }}>Group {item.active_group_id}</span>
                          )}
                          {item.active_coach_id && (
                            <span className="action-chip" style={{ cursor: 'default' }}>{item.active_coach_id}</span>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '0.25rem' }}>
                        Created: {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown'}
                      </div>
                    </div>
                    <div className="responsive-actions">
                      <button onClick={() => removeUser(item)} className="btn btn-danger btn-sm">
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
