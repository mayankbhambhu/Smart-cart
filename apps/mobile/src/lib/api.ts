import type { ApiErrorBody, AuthSession } from '@smartcart/shared';
import { readRefreshToken, useAuth, type Realm } from './auth';
import { API_URL } from './config';

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

  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? [];
    return Object.fromEntries(fields.map((f) => [f.path, f.message]));
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

function url(path: string, query?: QueryParams): string {
  const base = `${API_URL}/api/v1${path}`;
  if (!query) return base;
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return params ? `${base}?${params}` : base;
}

async function send(
  method: string,
  path: string,
  body: unknown,
  query: QueryParams | undefined,
  token?: string,
  headers?: Record<string, string>,
) {
  return fetch(url(path, query), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(response.status, 'HTTP_ERROR', `Request failed (${response.status})`);
  }
}

const refreshing = new Map<Realm, Promise<AuthSession | null>>();

/** Rotates the realm's refresh token (stored securely) for a new access token. */
export function refreshSession(realm: Realm): Promise<AuthSession | null> {
  const pending = refreshing.get(realm);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const refreshToken = await readRefreshToken(realm);
      if (!refreshToken) return null;
      const response = await send('POST', '/auth/refresh', { refreshToken, realm }, undefined);
      if (!response.ok) {
        if (response.status === 401) await useAuth.getState().clear(realm);
        return null;
      }
      const session = (await response.json()) as AuthSession;
      await useAuth.getState().setSession(realm, session);
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
  get<T>(path: string, query?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown, query?: QueryParams): Promise<T>;
  patch<T>(path: string, body?: unknown, query?: QueryParams): Promise<T>;
  put<T>(path: string, body?: unknown, query?: QueryParams): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export function createClient(realm: Realm | null, headers?: Record<string, string>): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown, query?: QueryParams): Promise<T> {
    const token = realm ? useAuth.getState().sessions[realm]?.accessToken : undefined;
    let response = await send(method, path, body, query, token, headers);
    if (response.status === 401 && realm && token) {
      const session = await refreshSession(realm);
      if (session) response = await send(method, path, body, query, session.accessToken, headers);
    }
    if (!response.ok) throw await toError(response);
    if (response.status === 204) return undefined as T;
    const type = response.headers.get('content-type') ?? '';
    return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>;
  }
  return {
    get: (path, query) => request('GET', path, undefined, query),
    post: (path, body, query) => request('POST', path, body ?? {}, query),
    patch: (path, body, query) => request('PATCH', path, body ?? {}, query),
    put: (path, body, query) => request('PUT', path, body ?? {}, query),
    delete: (path) => request('DELETE', path),
  };
}

export const publicApi = createClient(null);
export const customerApi = createClient('CUSTOMER');
export const staffApi = createClient('STAFF');

/** Restores both realms from their stored refresh tokens at launch. */
export async function bootstrapSessions(): Promise<void> {
  await Promise.all([refreshSession('CUSTOMER'), refreshSession('STAFF')]);
  useAuth.getState().markReady();
}

export async function logout(realm: Realm): Promise<void> {
  const refreshToken = await readRefreshToken(realm);
  try {
    if (refreshToken) await send('POST', '/auth/logout', { refreshToken, realm }, undefined);
  } finally {
    await useAuth.getState().clear(realm);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
