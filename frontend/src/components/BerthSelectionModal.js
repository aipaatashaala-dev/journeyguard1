import React, { useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../utils/config';

export default function BerthSelectionModal({ isOpen, journey, pnrData, onBerthSelected, onClose, user }) {
  const [selectedBerth, setSelectedBerth] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const availableBerths = pnrData?.available_berths || [];
  const allBerths = pnrData?.all_berths || [];

  const handleSelectBerth = async () => {
    if (!selectedBerth) {
      toast.error('Please select a berth');
      return;
    }

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `${API_BASE_URL}/pnr/${pnrData.pnr}/claim-berth`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            berth_number: selectedBerth,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.detail || 'Failed to select berth');
        setLoading(false);
        return;
      }

      toast.success(`✅ Berth ${selectedBerth} selected!`);
      
      // Update journey with selected berth
      const updatedJourney = {
        ...journey,
        berth: selectedBerth,
      };
      localStorage.setItem('jg_journey', JSON.stringify(updatedJourney));
      
      onBerthSelected(updatedJourney);
      onClose();
    } catch (error) {
      console.error('Error selecting berth:', error);
      toast.error('Error: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-primary)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        maxWidth: '500px',
        width: '90%',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0, padding: '1.5rem 2rem 0 2rem' }}>
          <h2 style={{ margin: 0, color: '#eef2ff', fontSize: '1.3rem' }}>
            🪑 Found {availableBerths.length} Berths
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#888',
            fontSize: '1.5rem',
          }}>
            ✕
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div style={{ overflowY: 'auto', minHeight: 0, maxHeight: '35vh', padding: '1rem 2rem' }}>
          <p style={{ color: '#aaa', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Great! We found multiple berths for PNR <strong>{pnrData.pnr}</strong> on train <strong>{pnrData.train_number}</strong>.
            <br />Please select your berth:
          </p>

          {/* Berth Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: '10px',
            marginBottom: '1.5rem',
          }}>
            {allBerths.map((berth) => {
              const isAvailable = availableBerths.includes(berth.berth_number);
              const isSelected = selectedBerth === berth.berth_number;

              return (
                <button
                  key={berth.berth_number}
                  onClick={() => isAvailable && setSelectedBerth(berth.berth_number)}
                  disabled={!isAvailable}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid var(--accent1)' : '1px solid rgba(255,255,255,0.1)',
                    background: isSelected ? 'rgba(0, 229, 192, 0.1)' : 
                                isAvailable ? 'var(--bg-secondary)' :
                                'rgba(255, 69, 0, 0.1)',
                    color: isSelected ? 'var(--accent1)' :
                           isAvailable ? '#eef2ff' :
                           '#888',
                    cursor: isAvailable ? 'pointer' : 'not-allowed',
                    fontWeight: isSelected ? 'bold' : 'normal',
                    transition: 'all 0.2s ease',
                    opacity: isAvailable ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                    {berth.berth_number}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
                    {berth.berth_type}
                  </div>
                  {isSelected && (
                    <div style={{ marginTop: '4px', color: 'var(--accent1)' }}>
                      <Check size={14} />
                    </div>
                  )}
                  {!isAvailable && (
                    <div style={{ marginTop: '4px', color: '#ff4500' }}>
                      ✕
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Berth Details */}
          {selectedBerth && (
            <div style={{
              background: 'rgba(0, 229, 192, 0.05)',
              border: '1px solid rgba(0, 229, 192, 0.2)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
            }}>
              <p style={{ margin: '0 0 8px 0', color: '#00e5c0' }}>
                Selected: <strong>{selectedBerth}</strong>
              </p>
              <p style={{ margin: 0, color: '#aaa' }}>
                Coach: <strong>{pnrData.coach}</strong>
              </p>
            </div>
          )}

          {/* Legend */}
          <div style={{
            fontSize: '0.8rem',
            color: '#888',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '12px',
            marginBottom: '1.5rem',
          }}>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--accent1)' }}>●</span> Available to claim
            </div>
            <div>
              <span style={{ color: '#ff4500' }}>●</span> Already claimed by others
            </div>
          </div>
        </div>

        {/* Fixed Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '10px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '1rem 2rem 1.5rem 2rem',
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          background: 'var(--bg-primary)',
          zIndex: 100,
        }}>
          <button
            onClick={handleSelectBerth}
            disabled={!selectedBerth || loading}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: selectedBerth ? '#22c55e' : '#555',
              color: selectedBerth ? '#000' : '#aaa',
              cursor: selectedBerth && !loading ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
              fontSize: '1rem',
            }}
          >
            {loading ? 'Selecting...' : 'Confirm Berth'}
          </button>
        </div>
      </div>
    </div>
  );
}
