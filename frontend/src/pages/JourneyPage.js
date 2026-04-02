import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function JourneyPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate('/dashboard', {
      replace: true,
      state: location.state || null,
    });
  }, [navigate, location.state]);

  return null;
}
