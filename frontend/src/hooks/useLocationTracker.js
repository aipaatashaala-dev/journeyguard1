import { useState, useEffect, useRef, useCallback } from 'react';
import { updateLocation } from '../utils/api';
import {
  DEFAULT_GEOLOCATION_OPTIONS,
  getGeolocationErrorMessage,
  getGeolocationUnavailableMessage,
} from '../utils/geolocation';

export function useLocationTracker(journeyId, isActive) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const watchRef = useRef(null);
  const intervalRef = useRef(null);
  const lastSentRef = useRef(null);
  const latestPositionRef = useRef(null);
  const latestAccuracyRef = useRef(null);

  const sendLocation = useCallback(async (lat, lng, acc) => {
    if (!journeyId || !isActive) return;
    try {
      await updateLocation({ journey_id: journeyId, lat, lng, accuracy: acc });
      lastSentRef.current = Date.now();
    } catch (e) {
      console.error('Location update failed:', e);
    }
  }, [journeyId, isActive]);

  useEffect(() => {
    latestPositionRef.current = position;
    latestAccuracyRef.current = accuracy;
  }, [position, accuracy]);

  useEffect(() => {
    if (!isActive) {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      setError(null);
      return;
    }

    const unavailableMessage = getGeolocationUnavailableMessage();
    if (unavailableMessage) {
      setError(unavailableMessage);
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });
        setAccuracy(acc);
        setError(null);

        // Throttle: send to backend at most every 30 seconds
        const now = Date.now();
        if (!lastSentRef.current || now - lastSentRef.current > 30000) {
          sendLocation(latitude, longitude, acc);
        }
      },
      (err) => setError(getGeolocationErrorMessage(err)),
      DEFAULT_GEOLOCATION_OPTIONS
    );

    // Periodic push every 60s regardless of movement
    intervalRef.current = setInterval(() => {
      if (latestPositionRef.current) {
        sendLocation(
          latestPositionRef.current.lat,
          latestPositionRef.current.lng,
          latestAccuracyRef.current
        );
      }
    }, 60000);

    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, sendLocation]);

  return { position, error, accuracy };
}
