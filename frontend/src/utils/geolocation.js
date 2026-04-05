const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export const DEFAULT_GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
};

const hasCapacitorRuntime = () =>
  typeof window !== 'undefined' &&
  typeof window.Capacitor?.getPlatform === 'function';

const isLocalhostHostname = (hostname = '') =>
  LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost');

export const hasSecureGeolocationContext = () => {
  if (typeof window === 'undefined') return true;
  if (hasCapacitorRuntime()) return true;
  return Boolean(window.isSecureContext || isLocalhostHostname(window.location.hostname));
};

export const getGeolocationUnavailableMessage = () => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'Live location is not supported on this device or browser.';
  }

  if (!hasSecureGeolocationContext()) {
    return 'Live location needs an HTTPS site on mobile browsers. Open JourneyGuard with the deployed frontend URL instead of a local or plain http address.';
  }

  return '';
};

export const getGeolocationErrorMessage = (error) => {
  const unavailableMessage = getGeolocationUnavailableMessage();
  if (unavailableMessage) return unavailableMessage;

  switch (error?.code) {
    case 1:
      return 'Location access was blocked. Allow geolocation permission in your browser settings and try again.';
    case 2:
      return 'Your location is unavailable right now. Check GPS/network access and try again.';
    case 3:
      return 'Location request timed out. Move to an open area and try again.';
    default:
      return error?.message || 'Could not access your device location.';
  }
};

export const requestCurrentPosition = (options = DEFAULT_GEOLOCATION_OPTIONS) =>
  new Promise((resolve, reject) => {
    const unavailableMessage = getGeolocationUnavailableMessage();
    if (unavailableMessage) {
      reject(new Error(unavailableMessage));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => reject(new Error(getGeolocationErrorMessage(error))),
      options
    );
  });
