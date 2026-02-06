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

export function getMediaServerUrl(): string {
  // Allow override for media server URL (highest priority)
  // Example: localStorage.setItem('edenMediaServerUrl','http://50.76.0.83:3001')
  const override = String(localStorage.getItem('edenMediaServerUrl') || '').trim();
  if (override) return override.replace(/\/+$/, '');

  // First, check if there's an API base URL override that has the server IP
  const apiBaseOverride = String(localStorage.getItem('edenApiBaseUrl') || '').trim();
  if (apiBaseOverride) {
    try {
      const overrideUrl = new URL(apiBaseOverride);
      const overrideHostname = overrideUrl.hostname;
      // If override has an IP/domain (not localhost), use it for media server
      if (overrideHostname !== 'localhost' && overrideHostname !== '127.0.0.1') {
        return `http://${overrideHostname}:3001`;
      }
    } catch (e) {
      // Override URL parsing failed, continue to next check
    }
  }

  // Second, check the resolved API base URL
  const apiBaseUrl = getApiBaseUrl();
  try {
    const apiUrl = new URL(apiBaseUrl);
    const apiHostname = apiUrl.hostname;
    // If API base URL uses an IP/domain (not localhost), use it for media server
    if (apiHostname !== 'localhost' && apiHostname !== '127.0.0.1') {
      return `http://${apiHostname}:3001`;
    }
  } catch (e) {
    // URL parsing failed, continue to next check
  }
  
  // Third, check window.location.hostname (but only if it's NOT localhost)
  const currentHostname = window.location.hostname;
  if (currentHostname !== 'localhost' && currentHostname !== '127.0.0.1') {
    return `http://${currentHostname}:3001`;
  }
  
  // If we're still here, everything is localhost
  // This means the user is accessing via localhost and hasn't set overrides
  // We'll use localhost but log a warning - user should set localStorage override
  console.warn('⚠️ [getMediaServerUrl] Using localhost for media server. Set localStorage.setItem("edenMediaServerUrl", "http://<server-ip>:3001") to use server IP.');
  return `http://${currentHostname}:3001`;
}

export function getWsBaseUrl(): string {
  const api = getApiBaseUrl();
  // Convert http(s)://host -> ws(s)://host
  if (api.startsWith('https://')) return api.replace(/^https:\/\//, 'wss://');
  if (api.startsWith('http://')) return api.replace(/^http:\/\//, 'ws://');
  // Fallback
  return `ws://${window.location.host}`;
}


