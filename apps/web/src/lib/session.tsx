import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageLoader } from '@/components/ui';
import { refreshSession } from './api';
import { hasSessionHint, useAuth, type Realm } from './auth';

/** Restores the realm's session from its refresh cookie once per page load. */
export function useBootstrap(realm: Realm): boolean {
  const ready = useAuth((state) => state.ready[realm] ?? false);
  useEffect(() => {
    if (ready) return;
    if (!hasSessionHint(realm)) {
      useAuth.getState().markReady(realm);
      return;
    }
    let cancelled = false;
    void refreshSession(realm).finally(() => {
      if (!cancelled) useAuth.getState().markReady(realm);
    });
    return () => {
      cancelled = true;
    };
  }, [realm, ready]);
  return ready;
}

export function RequireAuth({ realm, loginPath, children }: { realm: Realm; loginPath: string; children: ReactNode }) {
  const ready = useBootstrap(realm);
  const session = useAuth((state) => state.sessions[realm]);
  const location = useLocation();
  if (!ready) return <PageLoader />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${loginPath}?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function nextPath(search: string, fallback: string): string {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
