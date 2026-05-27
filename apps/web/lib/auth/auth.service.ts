/**
 * Auth Service - API calls for authentication.
 */

import axios from 'axios';
import { api } from '@/lib/api';

function formatLoginError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as Record<string, unknown> | undefined;
    if (!d) return err.message || 'Sign in failed';
    if (typeof d.detail === 'string') return d.detail;
    const role = d.role;
    if (Array.isArray(role) && role[0]) return String(role[0]);
    const nfe = d.non_field_errors;
    if (Array.isArray(nfe) && nfe[0]) return String(nfe[0]);
    if (typeof d.message === 'string') return d.message;
  }
  if (err instanceof Error) return err.message;
  return 'Sign in failed';
}

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'STAFF';
}

export interface LoginRequest {
  email: string;
  password: string;
  /** When set, API rejects login if it does not match the account’s role. */
  role?: 'ADMIN' | 'STAFF';
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface RefreshResponse {
  access: string;
}

const TOKEN_KEY = 'Quake_access_token';
const REFRESH_KEY = 'Quake_refresh_token';

export const authService = {
  /**
   * Login with email and password.
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    let response: LoginResponse;
    try {
      response = await api.post<LoginResponse>('/auth/login/', credentials);
    } catch (err) {
      throw new Error(formatLoginError(err));
    }

    // Store tokens
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, response.access);
      localStorage.setItem(REFRESH_KEY, response.refresh);
    }
    
    return response;
  },

  /**
   * Logout - blacklist refresh token.
   */
  logout: async (): Promise<void> => {
    const refresh = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
    
    try {
      if (refresh) {
        await api.post('/auth/logout/', { refresh });
      }
    } catch {
      // Ignore errors on logout
    } finally {
      // Clear tokens
      if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
      }
    }
  },

  /**
   * Refresh access token.
   */
  refresh: async (): Promise<RefreshResponse> => {
    const refresh = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
    
    if (!refresh) {
      throw new Error('No refresh token');
    }
    
    const response = await api.post<RefreshResponse>('/auth/refresh/', { refresh });
    
    // Store new access token
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, response.access);
    }
    
    return response;
  },

  /**
   * Get current user.
   */
  me: async (): Promise<User> => {
    return api.get<User>('/auth/me/');
  },

  /**
   * Get stored access token.
   */
  getAccessToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Check if user has a stored token.
   */
  hasToken: (): boolean => {
    return !!authService.getAccessToken();
  },

  /**
   * Clear all tokens.
   */
  clearTokens: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
  },
};

export default authService;
