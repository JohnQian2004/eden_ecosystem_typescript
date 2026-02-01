/**
 * API Base URL Configuration for React Native
 * Server IP: 50.76.0.85
 */

import { Platform } from 'react-native';

// Hardcoded server IP address
// For local development, use 'localhost' or your local network IP (192.168.x.x)
// For remote access, use a public IP, domain, or tunneling service URL
const SERVER_IP = '50.76.0.85'; // Server IP address
const SERVER_PORT = '3000';
// Server uses HTTPS
const USE_HTTPS = true; // Server is configured with HTTPS

// Runtime config (can be set via AsyncStorage in the future)
let runtimeApiBase: string | null = null;

export function setApiBaseUrl(url: string) {
  runtimeApiBase = url;
}

function getWebApiBaseUrl(): string {
  // Use hardcoded server IP with protocol
  const protocol = USE_HTTPS ? 'https' : 'http';
  return `${protocol}://${SERVER_IP}:${SERVER_PORT}`;
}

function getNativeApiBaseUrl(): string {
  // Use hardcoded server IP with protocol
  const protocol = USE_HTTPS ? 'https' : 'http';
  return `${protocol}://${SERVER_IP}:${SERVER_PORT}`;
}

export function getApiBaseUrl(): string {
  // Check runtime override first (highest priority)
  if (runtimeApiBase) {
    return runtimeApiBase;
  }
  
  // Check for environment variable (second priority)
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  
  // Use hardcoded server IP for all platforms
  if (Platform.OS === 'web') {
    return getWebApiBaseUrl();
  } else {
    return getNativeApiBaseUrl();
  }
}

export function getWsBaseUrl(): string {
  const api = getApiBaseUrl();
  // Convert http(s)://host -> ws(s)://host
  if (api.startsWith('https://')) return api.replace(/^https:\/\//, 'wss://');
  if (api.startsWith('http://')) return api.replace(/^http:\/\//, 'ws://');
  // Fallback
  return `ws://${api.replace(/^https?:\/\//, '')}`;
}

