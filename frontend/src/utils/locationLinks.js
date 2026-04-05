const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const isPrivateIpv4 = (hostname = '') =>
  /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
  /^192\.168\.\d+\.\d+$/.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname) ||
  /^169\.254\.\d+\.\d+$/.test(hostname);

const isLocalTrackingHost = (hostname = '') =>
  LOCAL_HOSTNAMES.has(hostname) ||
  hostname.endsWith('.localhost') ||
  isPrivateIpv4(hostname);

export const resolveTrackingLink = (value) => {
  if (!value || typeof window === 'undefined') return value || '';

  try {
    const parsed = new URL(value);
    if (!isLocalTrackingHost(parsed.hostname)) {
      return value;
    }

    if (isLocalTrackingHost(window.location.hostname)) {
      return value;
    }

    return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
  }
};
