/**
 * Auth Store - Zustand store for auth state management.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, LoginRequest, User } from './auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (credentials: LoginRequest) => {
        const response = await authService.login(credentials);
        set({
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      logout: async () => {
        await authService.logout();
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      checkAuth: async () => {
        if (!authService.hasToken()) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        try {
          const user = await authService.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          // Token invalid, try refresh
          try {
            await authService.refresh();
            const user = await authService.me();
            set({ user, isAuthenticated: true, isLoading: false });
          } catch {
            // Refresh failed, logout
            authService.clearTokens();
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        }
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },
    }),
    {
      name: 'Quake-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

export default useAuthStore;
