export function getApiBaseUrl(): string {
  // Allow override for cases where Angular is served separately from the server.
  // Example: localStorage.setItem('edenApiBaseUrl','http://10.0.0.12:3000')
  const override = String(localStorage.getItem('edenApiBaseUrl') || '').trim();
  if (override) return override.replace(/\/+$/, '');

  // Dev convenience: when running `ng serve` (default :4200), assume backend is on :3000
  // using the SAME hostname (IP/domain), so this works remotely too.
  if (window.location.port === '4200') {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  // Default: same-origin (works when server serves the built Angular app)
  return `${window.location.protocol}//${window.location.host}`;
}

export function getWsBaseUrl(): string {
  const api = getApiBaseUrl();
  // Convert http(s)://host -> ws(s)://host
  if (api.startsWith('https://')) return api.replace(/^https:\/\//, 'wss://');
  if (api.startsWith('http://')) return api.replace(/^http:\/\//, 'ws://');
  // Fallback
  return `ws://${window.location.host}`;
}


