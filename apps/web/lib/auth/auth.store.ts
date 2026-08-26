/**
 * Auth Store — tenant (shop) session only.
 * Flow: /login → /admin|/pos → logout → /login
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  authService,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
} from "./auth.service";
import { clearPosSession } from "@/features/pos/store/usePosStore";
import { clearAppQueryCache } from "@/lib/api/query-provider";
import { withAuthScope } from "@/lib/api/client";
import {
  endSession,
  getLocalSessionVerdict,
  markSessionStarted,
  touchSessionActivity,
} from "./session-lifecycle";
import { TENANT_AUTH_PERSIST_KEY, clearPersistedAuth } from "./session-scope";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  hasBootstrapped: boolean;

  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  establishSession: (response: LoginResponse) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  /** After create/switch business — update user + clear cached org data. */
  applyActiveBusiness: (user: User) => void;
  setHasHydrated: (value: boolean) => void;
}

let checkAuthInFlight: Promise<void> | null = null;
let authEpoch = 0;

function hasCachedSession(state: Pick<AuthState, "isAuthenticated" | "user">) {
  return Boolean(
    state.isAuthenticated && state.user && authService.hasToken("tenant"),
  );
}

function clearTenantLocalState(
  set: (partial: Partial<AuthState>) => void,
) {
  clearPosSession();
  clearAppQueryCache();
  clearPersistedAuth("tenant");
  set({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    hasBootstrapped: true,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      hasBootstrapped: false,

      setHasHydrated: (value: boolean) => set({ hasHydrated: value }),

      establishSession: (response: LoginResponse) => {
        authEpoch += 1;
        clearAppQueryCache();
        markSessionStarted("tenant");
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          hasBootstrapped: true,
        });
      },

      login: async (credentials: LoginRequest) => {
        const response = await authService.login({
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
        });
        get().establishSession(response);
      },

      register: async (data: RegisterRequest) => {
        const response = await authService.register({
          email: data.email.trim().toLowerCase(),
          password: data.password,
          name: data.name?.trim() || undefined,
          industry: data.industry,
        });
        get().establishSession(response);
      },

      logout: async () => {
        authEpoch += 1;
        try {
          await authService.logout("tenant");
        } finally {
          clearTenantLocalState(set);
          endSession("tenant", "logout");
        }
      },

      checkAuth: async () => {
        if (checkAuthInFlight) return checkAuthInFlight;

        const epochAtStart = authEpoch;

        checkAuthInFlight = (async () => {
          const snapshot = get();
          const cached = hasCachedSession(snapshot);
          const hasToken = authService.hasToken("tenant");

          if (!snapshot.hasBootstrapped || (hasToken && !cached)) {
            set({ isLoading: true });
          }

          if (!hasToken) {
            if (epochAtStart === authEpoch) {
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                hasBootstrapped: true,
              });
            }
            return;
          }

          const verdict = getLocalSessionVerdict("tenant");
          if (!verdict.ok) {
            if (epochAtStart !== authEpoch) return;
            clearTenantLocalState(set);
            endSession("tenant", verdict.reason);
            return;
          }

          try {
            const user = await withAuthScope("tenant", () => authService.me());
            if (epochAtStart !== authEpoch) return;
            if (user.isSuperuser) {
              authService.clearTokens("tenant");
              clearTenantLocalState(set);
              endSession("tenant", "invalid");
              return;
            }
            touchSessionActivity("tenant");
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              hasBootstrapped: true,
            });
          } catch {
            try {
              await withAuthScope("tenant", () =>
                authService.refresh("tenant"),
              );
              const user = await withAuthScope("tenant", () =>
                authService.me(),
              );
              if (epochAtStart !== authEpoch) return;
              if (user.isSuperuser) {
                authService.clearTokens("tenant");
                clearTenantLocalState(set);
                endSession("tenant", "invalid");
                return;
              }
              touchSessionActivity("tenant");
              set({
                user,
                isAuthenticated: true,
                isLoading: false,
                hasBootstrapped: true,
              });
            } catch {
              if (epochAtStart !== authEpoch) return;
              clearTenantLocalState(set);
              endSession("tenant", "session_expired");
            }
          }
        })();

        try {
          await checkAuthInFlight;
        } finally {
          checkAuthInFlight = null;
        }
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      applyActiveBusiness: (user: User) => {
        clearPosSession();
        clearAppQueryCache();
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          hasBootstrapped: true,
        });
      },
    }),
    {
      name: TENANT_AUTH_PERSIST_KEY,
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (
          state?.isAuthenticated &&
          state.user &&
          authService.hasToken("tenant")
        ) {
          useAuthStore.setState({ isLoading: true, hasBootstrapped: false });
        }
        queueMicrotask(() => {
          useAuthStore.getState().setHasHydrated(true);
        });
      },
    },
  ),
);

export default useAuthStore;
