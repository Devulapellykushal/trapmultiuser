/**
 * Auth Service - API calls for authentication.
 * Tenant and platform sessions use separate localStorage keys.
 */

import axios from 'axios';
import { api } from '@/lib/api';
import {
  applyRotatedTokens,
  markSessionStarted,
} from './session-lifecycle';
import {
  AuthScope,
  clearSessionTokens,
  readAccessToken,
  readRefreshToken,
  storeSessionTokens,
} from './session-scope';
function formatAuthError(err: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as Record<string, unknown> | undefined;
    if (!d) return err.message || fallback;
    const wrapped = d.error;
    if (wrapped && typeof wrapped === 'object' && 'message' in wrapped) {
      const msg = (wrapped as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
    if (typeof d.detail === 'string') return d.detail;
    const nested = d.error;
    if (nested && typeof nested === 'object' && nested !== null) {
      const msg = (nested as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
    const role = d.role;
    if (Array.isArray(role) && role[0]) return String(role[0]);
    const nfe = d.non_field_errors;
    if (Array.isArray(nfe) && nfe[0]) return String(nfe[0]);
    if (typeof d.message === 'string') return d.message;
    if (typeof d.email === 'string') return d.email;
    if (Array.isArray(d.email) && d.email[0]) return String(d.email[0]);
    if (typeof d.password === 'string') return d.password;
    if (Array.isArray(d.password) && d.password[0]) return String(d.password[0]);
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'STAFF';
  organizationId?: string | null;
  organizationName?: string | null;
  isSuperuser?: boolean;
  /** UX profile of the *active* business: auto_tyre | fmcg | fnb | general (fixed per org) */
  industry?: string | null;
  enabledServices?: Partial<
    Record<
      | 'pos'
      | 'warehouses'
      | 'stores'
      | 'inventory'
      | 'customers'
      | 'sales'
      | 'reports'
      | 'analytics',
      boolean
    >
  >;
}

export interface BusinessMembership {
  organizationId: string;
  name: string;
  industry: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
}

export interface CreateBusinessRequest {
  name: string;
  industry?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  industry?: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface RefreshResponse {
  access: string;
  /** Present when ROTATE_REFRESH_TOKENS is enabled on the API. */
  refresh?: string;
}

export interface AuthCapabilities {
  publicSignupEnabled: boolean;
  smtpReady: boolean;
  passwordResetEnabled: boolean;
  emailAdapter: string;
}

export interface PasswordForgotResponse {
  message: string;
  devToken?: string;
  devResetUrl?: string;
}

async function rawLogin(credentials: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login/', credentials);
}

export const authService = {
  /** Tenant (shop) login — rejects platform superuser accounts. */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    try {
      const response = await rawLogin(credentials);
      if (response.user?.isSuperuser) {
        throw new Error(
          'Platform owner accounts sign in at /superadmin/login — not the shop login.',
        );
      }
      storeSessionTokens('tenant', response.access, response.refresh);
      markSessionStarted('tenant');
      return response;
    } catch (err) {
      throw new Error(formatAuthError(err, 'Sign in failed'));
    }
  },

  /** Platform owner login — requires is_superuser. */
  loginPlatform: async (credentials: LoginRequest): Promise<LoginResponse> => {
    try {
      const response = await rawLogin(credentials);
      if (!response.user?.isSuperuser) {
        throw new Error(
          'This console is for the Quake platform owner only. Shop users sign in at /login.',
        );
      }
      storeSessionTokens('platform', response.access, response.refresh);
      markSessionStarted('platform');
      return response;
    } catch (err) {
      throw new Error(formatAuthError(err, 'Platform sign in failed'));
    }
  },

  register: async (data: RegisterRequest): Promise<LoginResponse> => {
    try {
      const response = await api.post<LoginResponse>('/auth/register/', data);
      storeSessionTokens('tenant', response.access, response.refresh);
      markSessionStarted('tenant');
      return response;
    } catch (err) {
      throw new Error(formatAuthError(err, 'Sign up failed'));
    }
  },

  /** Create account only — does not sign in (signup → login page flow). */
  registerAccount: async (data: RegisterRequest): Promise<User> => {
    try {
      const response = await api.post<LoginResponse>('/auth/register/', data);
      return response.user;
    } catch (err) {
      throw new Error(formatAuthError(err, 'Sign up failed'));
    }
  },

  forgotPassword: async (email: string): Promise<PasswordForgotResponse> => {
    try {
      return await api.post<PasswordForgotResponse>('/auth/password/forgot/', {
        email,
      });
    } catch (err) {
      throw new Error(formatAuthError(err, 'Could not send reset email'));
    }
  },

  resetPassword: async (
    token: string,
    newPassword: string,
  ): Promise<LoginResponse> => {
    try {
      const response = await api.post<LoginResponse>('/auth/password/reset/', {
        token,
        new_password: newPassword,
      });
      storeSessionTokens('tenant', response.access, response.refresh);
      markSessionStarted('tenant');
      return response;
    } catch (err) {
      throw new Error(formatAuthError(err, 'Password reset failed'));
    }
  },

  getCapabilities: async (): Promise<AuthCapabilities> => {
    const raw = await api.get<Record<string, unknown>>('/auth/capabilities/');
    return {
      publicSignupEnabled: Boolean(raw.publicSignupEnabled ?? raw.public_signup_enabled),
      smtpReady: Boolean(raw.smtpReady ?? raw.smtp_ready),
      passwordResetEnabled: Boolean(
        raw.passwordResetEnabled ?? raw.password_reset_enabled,
      ),
      emailAdapter: String(raw.emailAdapter ?? raw.email_adapter ?? 'smtp'),
    };
  },

  logout: async (scope: AuthScope = 'tenant'): Promise<void> => {
    const refresh = readRefreshToken(scope);

    try {
      if (refresh) {
        await api.post('/auth/logout/', { refresh });
      }
    } catch {
      // Ignore errors on logout
    } finally {
      clearSessionTokens(scope);
    }
  },

  refresh: async (scope: AuthScope = 'tenant'): Promise<RefreshResponse> => {
    const refresh = readRefreshToken(scope);

    if (!refresh) {
      throw new Error('No refresh token');
    }

    const response = await api.post<RefreshResponse>('/auth/refresh/', { refresh });
    applyRotatedTokens(scope, response.access, response.refresh);
    return response;
  },

  me: async (): Promise<User> => {
    return api.get<User>('/auth/me/');
  },

  getAccessToken: (scope: AuthScope = 'tenant'): string | null => {
    return readAccessToken(scope);
  },

  /** True when either access or refresh is present (refresh keeps the session alive). */
  hasToken: (scope: AuthScope = 'tenant'): boolean => {
    return !!readAccessToken(scope) || !!readRefreshToken(scope);
  },

  clearTokens: (scope: AuthScope = 'tenant'): void => {
    clearSessionTokens(scope);
  },

  /** Businesses this login can switch between (each has fixed industry + isolated data). */
  listBusinesses: async (): Promise<BusinessMembership[]> => {
    try {
      return await api.get<BusinessMembership[]>('/auth/businesses/');
    } catch (err) {
      throw new Error(formatAuthError(err, 'Could not load businesses'));
    }
  },

  /** Create another empty business and make it the active workspace. */
  createBusiness: async (data: CreateBusinessRequest): Promise<User> => {
    try {
      return await api.post<User>('/auth/businesses/', data);
    } catch (err) {
      throw new Error(formatAuthError(err, 'Could not create business'));
    }
  },

  /** Switch active business — scopes the whole app to that org's data. */
  switchBusiness: async (organizationId: string): Promise<User> => {
    try {
      return await api.post<User>('/auth/businesses/switch/', { organizationId });
    } catch (err) {
      throw new Error(formatAuthError(err, 'Could not switch business'));
    }
  },

  /** Unlink this login from a business (keeps org data; removes your access). */
  leaveBusiness: async (organizationId: string): Promise<User> => {
    try {
      return await api.post<User>('/auth/businesses/leave/', { organizationId });
    } catch (err) {
      throw new Error(formatAuthError(err, 'Could not leave business'));
    }
  },
};

export default authService;
