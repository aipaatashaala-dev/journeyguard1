import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

const MOBILE_BREAKPOINT = 768;

const getIsMobile = () =>
  typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;

export default function MainLayout({ children }) {
  const [isMobile, setIsMobile] = useState(getIsMobile);
  const [sidebarOpen, setSidebarOpen] = useState(() => !getIsMobile());

  useEffect(() => {
    const handleResize = () => {
      const mobile = getIsMobile();
      setIsMobile((prev) => {
        if (prev !== mobile) {
          setSidebarOpen(!mobile);
        }
        return mobile;
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        isOpen={sidebarOpen}
        isMobile={isMobile}
        onClose={() => setSidebarOpen(false)}
      />
      <button
        type="button"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label="Toggle sidebar"
        style={{
          position: 'fixed',
          top: 18,
          left: 18,
          zIndex: 1100,
          width: 46,
          height: 46,
          borderRadius: 12,
          border: '1px solid rgba(181,102,24,0.14)',
          background: 'rgba(255,255,255,0.92)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Menu size={20} />
      </button>
      <div
        data-sidebar
        style={{
          marginLeft: !isMobile && sidebarOpen ? 280 : 0,
          flex: 1,
          background: 'var(--bg)',
          transition: 'margin-left 0.2s ease',
        }}
      >
        {children}
      </div>
      <style>{`
        @media (max-width: 768px) {
          [data-sidebar] {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
