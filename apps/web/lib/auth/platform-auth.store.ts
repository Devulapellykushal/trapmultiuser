/**
 * Platform owner auth store — isolated from tenant shop sessions.
 * Flow: /superadmin/login → /superadmin → logout → /superadmin/login
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authService, LoginRequest, LoginResponse, User } from "./auth.service";
import { withAuthScope } from "@/lib/api/client";
import {
  PLATFORM_AUTH_PERSIST_KEY,
  clearPersistedAuth,
  redirectToLogin,
} from "./session-scope";

interface PlatformAuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  hasBootstrapped: boolean;

  login: (credentials: LoginRequest) => Promise<void>;
  establishSession: (response: LoginResponse) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

let checkAuthInFlight: Promise<void> | null = null;
let authEpoch = 0;

function clearPlatformLocalState(
  set: (partial: Partial<PlatformAuthState>) => void,
) {
  clearPersistedAuth("platform");
  set({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    hasBootstrapped: true,
  });
}

export const usePlatformAuthStore = create<PlatformAuthState>()(
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
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          hasBootstrapped: true,
        });
      },

      login: async (credentials: LoginRequest) => {
        const response = await authService.loginPlatform({
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
        });
        get().establishSession(response);
      },

      logout: async () => {
        authEpoch += 1;
        try {
          await authService.logout("platform");
        } finally {
          clearPlatformLocalState(set);
          redirectToLogin("platform");
        }
      },

      checkAuth: async () => {
        if (checkAuthInFlight) return checkAuthInFlight;

        const epochAtStart = authEpoch;

        checkAuthInFlight = (async () => {
          const snapshot = get();
          const hasToken = authService.hasToken("platform");
          const cached = Boolean(
            snapshot.isAuthenticated && snapshot.user && hasToken,
          );

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

          try {
            const user = await withAuthScope("platform", () =>
              authService.me(),
            );
            if (epochAtStart !== authEpoch) return;
            if (!user.isSuperuser) {
              authService.clearTokens("platform");
              clearPlatformLocalState(set);
              return;
            }
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              hasBootstrapped: true,
            });
          } catch {
            try {
              await withAuthScope("platform", () =>
                authService.refresh("platform"),
              );
              const user = await withAuthScope("platform", () =>
                authService.me(),
              );
              if (epochAtStart !== authEpoch) return;
              if (!user.isSuperuser) {
                authService.clearTokens("platform");
                clearPlatformLocalState(set);
                return;
              }
              set({
                user,
                isAuthenticated: true,
                isLoading: false,
                hasBootstrapped: true,
              });
            } catch {
              if (epochAtStart !== authEpoch) return;
              authService.clearTokens("platform");
              clearPlatformLocalState(set);
            }
          }
        })();

        try {
          await checkAuthInFlight;
        } finally {
          checkAuthInFlight = null;
        }
      },
    }),
    {
      name: PLATFORM_AUTH_PERSIST_KEY,
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (
          state?.isAuthenticated &&
          state.user &&
          authService.hasToken("platform")
        ) {
          usePlatformAuthStore.setState({
            isLoading: true,
            hasBootstrapped: false,
          });
        }
        queueMicrotask(() => {
          usePlatformAuthStore.getState().setHasHydrated(true);
        });
      },
    },
  ),
);

export default usePlatformAuthStore;
