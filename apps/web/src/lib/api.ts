import type { ApiErrorBody, AuthSession } from '@smartcart/shared';
import { useAuth, type Realm } from './auth';

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages keyed by path ("address.pincode"). */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
    return Object.fromEntries(fields.map((f) => [f.path, f.message]));
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function apiUrl(path: string, query?: QueryParams): string {
  const url = `${API_BASE}/api/v1${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(method: string, path: string, options: RequestOptions, token?: string): Promise<Response> {
  return fetch(apiUrl(path, options.query), {
    method,
    credentials: 'include',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(response.status, 'HTTP_ERROR', response.statusText || 'Request failed');
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}

const refreshing = new Map<Realm, Promise<AuthSession | null>>();

/** Exchanges the realm's refresh cookie for a new access token (deduplicated). */
export function refreshSession(realm: Realm): Promise<AuthSession | null> {
  const pending = refreshing.get(realm);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const response = await send('POST', '/auth/refresh', { body: { realm } });
      if (!response.ok) {
        useAuth.getState().clear(realm);
        return null;
      }
      const session = (await response.json()) as AuthSession;
      useAuth.getState().setSession(realm, session);
      return session;
    } catch {
      return null;
    } finally {
      refreshing.delete(realm);
    }
  })();
  refreshing.set(realm, promise);
  return promise;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

/** API client bound to one realm: attaches its token and refreshes once on 401. */
export function createClient(realm: Realm | null): ApiClient {
  async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const token = realm ? useAuth.getState().sessions[realm]?.accessToken : undefined;
    let response = await send(method, path, options, token);
    if (response.status === 401 && realm && token) {
      const session = await refreshSession(realm);
      if (session) response = await send(method, path, options, session.accessToken);
    }
    if (!response.ok) throw await toError(response);
    return parse<T>(response);
  }
  return {
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body: body ?? {} }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body: body ?? {} }),
    put: (path, body, options) => request('PUT', path, { ...options, body: body ?? {} }),
    delete: (path, options) => request('DELETE', path, options),
  };
}

export const publicApi = createClient(null);
export const customerApi = createClient('CUSTOMER');
export const staffApi = createClient('STAFF');
export const adminApi = createClient('ADMIN');

/** For hardware simulators: authenticates with a device key instead of a user. */
export function deviceClient(deviceKey: string): ApiClient {
  const client = createClient(null);
  const headers = { 'X-Device-Key': deviceKey };
  return {
    get: (path, options) => client.get(path, { ...options, headers }),
    post: (path, body, options) => client.post(path, body, { ...options, headers }),
    patch: (path, body, options) => client.patch(path, body, { ...options, headers }),
    put: (path, body, options) => client.put(path, body, { ...options, headers }),
    delete: (path, options) => client.delete(path, { ...options, headers }),
  };
}

export async function logout(realm: Realm): Promise<void> {
  try {
    await send('POST', '/auth/logout', { body: { realm } });
  } finally {
    useAuth.getState().clear(realm);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
