const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const GEOLOCATION_PERMISSION_NAME = 'geolocation';

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

const canUsePermissionsApi = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.permissions?.query === 'function';

export const getGeolocationPermissionBlockedMessage = () =>
  'Location access is blocked for this site. Allow location access in your browser site settings, then try again.';

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

export const getGeolocationPermissionState = async () => {
  if (!canUsePermissionsApi()) return 'unsupported';

  try {
    const permissionStatus = await navigator.permissions.query({
      name: GEOLOCATION_PERMISSION_NAME,
    });
    return permissionStatus?.state || 'unsupported';
  } catch {
    return 'unsupported';
  }
};

export const watchGeolocationPermission = async (onChange) => {
  if (!canUsePermissionsApi()) return () => {};

  try {
    const permissionStatus = await navigator.permissions.query({
      name: GEOLOCATION_PERMISSION_NAME,
    });
    const handleChange = () => onChange(permissionStatus?.state || 'unsupported');

    if (typeof permissionStatus.addEventListener === 'function') {
      permissionStatus.addEventListener('change', handleChange);
      return () => permissionStatus.removeEventListener('change', handleChange);
    }

    permissionStatus.onchange = handleChange;
    return () => {
      permissionStatus.onchange = null;
    };
  } catch {
    return () => {};
  }
};

export const getGeolocationErrorMessage = (error) => {
  const unavailableMessage = getGeolocationUnavailableMessage();
  if (unavailableMessage) return unavailableMessage;

  switch (error?.code) {
    case 1:
      return getGeolocationPermissionBlockedMessage();
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

export const requestGeolocationPermission = async (
  options = DEFAULT_GEOLOCATION_OPTIONS
) => {
  const permissionState = await getGeolocationPermissionState();

  if (permissionState === 'denied') {
    throw new Error(getGeolocationPermissionBlockedMessage());
  }

  return requestCurrentPosition(options);
};
