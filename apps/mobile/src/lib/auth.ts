import type { AuthSession, AuthUser, StaffMembership } from '@smartcart/shared';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/** The mobile app signs in as a shopper and, optionally, as a store employee at the same time. */
export type Realm = 'CUSTOMER' | 'STAFF';

export interface RealmSession {
  user: AuthUser;
  accessToken: string;
  memberships: StaffMembership[];
}

const refreshKey = (realm: Realm) => `smartcart_refresh_${realm.toLowerCase()}`;

interface AuthState {
  sessions: Partial<Record<Realm, RealmSession>>;
  ready: boolean;
  setSession: (realm: Realm, session: AuthSession) => Promise<void>;
  updateUser: (realm: Realm, user: AuthUser) => void;
  clear: (realm: Realm) => Promise<void>;
  markReady: () => void;
}

/**
 * Access tokens stay in memory; refresh tokens live in the iOS Keychain /
 * Android Keystore through expo-secure-store and rotate on every refresh.
 */
export const useAuth = create<AuthState>()((set) => ({
  sessions: {},
  ready: false,
  setSession: async (realm, session) => {
    await SecureStore.setItemAsync(refreshKey(realm), session.refreshToken);
    set((state) => ({
      sessions: { ...state.sessions, [realm]: { user: session.user, accessToken: session.accessToken, memberships: session.memberships } },
    }));
  },
  updateUser: (realm, user) =>
    set((state) => {
      const current = state.sessions[realm];
      return current ? { sessions: { ...state.sessions, [realm]: { ...current, user } } } : state;
    }),
  clear: async (realm) => {
    await SecureStore.deleteItemAsync(refreshKey(realm));
    set((state) => {
      const sessions = { ...state.sessions };
      delete sessions[realm];
      return { sessions };
    });
  },
  markReady: () => set({ ready: true }),
}));

export function readRefreshToken(realm: Realm): Promise<string | null> {
  return SecureStore.getItemAsync(refreshKey(realm));
}

export function useSession(realm: Realm): RealmSession | undefined {
  return useAuth((state) => state.sessions[realm]);
}
