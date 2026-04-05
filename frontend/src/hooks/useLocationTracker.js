import { useState, useEffect, useRef, useCallback } from 'react';
import { updateLocation } from '../utils/api';
import {
  DEFAULT_GEOLOCATION_OPTIONS,
  getGeolocationErrorMessage,
  getGeolocationUnavailableMessage,
  watchGeolocationPermission,
} from '../utils/geolocation';

export function useLocationTracker(journeyId, isActive) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [restartKey, setRestartKey] = useState(0);
  const watchRef = useRef(null);
  const intervalRef = useRef(null);
  const lastSentRef = useRef(null);
  const latestPositionRef = useRef(null);
  const latestAccuracyRef = useRef(null);

  const clearTracking = useCallback(() => {
    if (watchRef.current && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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

  const retryTracking = useCallback(() => {
    setError(null);
    setRestartKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let disposed = false;
    let detachPermissionListener = () => {};

    if (!isActive) {
      clearTracking();
      setError(null);
      return undefined;
    }

    const unavailableMessage = getGeolocationUnavailableMessage();
    if (unavailableMessage) {
      clearTracking();
      setError(unavailableMessage);
      return undefined;
    }

    clearTracking();

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
      (err) => {
        if (err?.code === 1) {
          clearTracking();
        }
        setError(getGeolocationErrorMessage(err));
      },
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

    watchGeolocationPermission((permissionState) => {
      if (disposed) return;

      if (permissionState === 'granted') {
        setError(null);
        setRestartKey((value) => value + 1);
        return;
      }

      if (permissionState === 'denied') {
        clearTracking();
        setError(getGeolocationErrorMessage({ code: 1 }));
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      detachPermissionListener = cleanup;
    });

    return () => {
      disposed = true;
      detachPermissionListener();
      clearTracking();
    };
  }, [clearTracking, isActive, sendLocation, restartKey]);

  return { position, error, accuracy, retryTracking };
}
