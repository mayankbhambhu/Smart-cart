import type { AuthSession, AuthUser, StaffMembership, UserKind } from '@smartcart/shared';
import { create } from 'zustand';

export type Realm = UserKind;

export interface RealmSession {
  user: AuthUser;
  accessToken: string;
  memberships: StaffMembership[];
}

interface AuthState {
  sessions: Partial<Record<Realm, RealmSession>>;
  /** True once we have tried to restore the realm's session from its refresh cookie. */
  ready: Partial<Record<Realm, boolean>>;
  setSession: (realm: Realm, session: AuthSession | RealmSession) => void;
  updateUser: (realm: Realm, user: AuthUser) => void;
  clear: (realm: Realm) => void;
  markReady: (realm: Realm) => void;
}

const HINT_PREFIX = 'smartcart-signed-in:';

/**
 * Whether this browser signed in to the realm before. The refresh cookie is
 * httpOnly, so this flag lets anonymous visitors skip a refresh call that can
 * only fail.
 */
export function hasSessionHint(realm: Realm): boolean {
  try {
    return localStorage.getItem(HINT_PREFIX + realm) === '1';
  } catch {
    return true;
  }
}

function setSessionHint(realm: Realm, signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(HINT_PREFIX + realm, '1');
    else localStorage.removeItem(HINT_PREFIX + realm);
  } catch {
    // storage unavailable: we simply always try the refresh
  }
}

/**
 * Access tokens live in memory only. Each portal (shop, store ops, admin)
 * restores its own session from an httpOnly refresh cookie on load.
 */
export const useAuth = create<AuthState>()((set) => ({
  sessions: {},
  ready: {},
  setSession: (realm, session) => {
    setSessionHint(realm, true);
    set((state) => ({
      sessions: {
        ...state.sessions,
        [realm]: { user: session.user, accessToken: session.accessToken, memberships: session.memberships },
      },
    }));
  },
  updateUser: (realm, user) =>
    set((state) => {
      const current = state.sessions[realm];
      return current ? { sessions: { ...state.sessions, [realm]: { ...current, user } } } : state;
    }),
  clear: (realm) => {
    setSessionHint(realm, false);
    set((state) => {
      const sessions = { ...state.sessions };
      delete sessions[realm];
      return { sessions };
    });
  },
  markReady: (realm) => set((state) => ({ ready: { ...state.ready, [realm]: true } })),
}));

export function useSession(realm: Realm): RealmSession | undefined {
  return useAuth((state) => state.sessions[realm]);
}

export function currentToken(realm: Realm): string | undefined {
  return useAuth.getState().sessions[realm]?.accessToken;
}
