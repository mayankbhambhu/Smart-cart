import Constants from 'expo-constants';

/** Host of the machine running `expo start`, so a phone on the same Wi-Fi reaches the dev API. */
function devHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? (hostUri.split(':')[0] ?? null) : null;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; webUrl?: string };
const host = devHost();

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  extra.apiUrl ??
  (host ? `http://${host}:4000` : 'http://localhost:4000')
).replace(/\/$/, '');
export const WEB_URL = (
  process.env.EXPO_PUBLIC_WEB_URL ??
  extra.webUrl ??
  (host ? `http://${host}:5173` : 'http://localhost:5173')
).replace(/\/$/, '');
