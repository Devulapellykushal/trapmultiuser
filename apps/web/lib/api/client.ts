/**
 * Centralized API Client — attaches the token for the active session scope.
 * Tenant and platform refresh/logout never cross.
 */
import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import {
  applyRotatedTokens,
  endSession,
  touchSessionActivity,
} from "@/lib/auth/session-lifecycle";
import {
  AuthScope,
  getAuthScopeFromPath,
  readAccessToken,
  readRefreshToken,
} from "@/lib/auth/session-scope";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000/api/v1"
    : "https://trapmultiuser.onrender.com/api/v1");

type ScopedConfig = InternalAxiosRequestConfig & {
  __quakeAuthScope?: AuthScope;
  _retry?: boolean;
};

/** Optional override while a store validates its own session (e.g. /auth/me/). */
let forcedAuthScope: AuthScope | null = null;

export async function withAuthScope<T>(
  scope: AuthScope,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = forcedAuthScope;
  forcedAuthScope = scope;
  try {
    return await fn();
  } finally {
    forcedAuthScope = prev;
  }
}

function activeScope(): AuthScope {
  return forcedAuthScope ?? getAuthScopeFromPath();
}

function isAuthBootstrapUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/logout") ||
    url.includes("/auth/register") ||
    url.includes("/auth/password/")
  );
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

const isRefreshing: Record<AuthScope, boolean> = {
  tenant: false,
  platform: false,
};

const failedQueue: Record<
  AuthScope,
  Array<{
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }>
> = {
  tenant: [],
  platform: [],
};

const processQueue = (
  scope: AuthScope,
  error: unknown,
  token: string | null = null,
) => {
  failedQueue[scope].forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue[scope] = [];
};

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const scoped = config as ScopedConfig;
    const scope = activeScope();
    scoped.__quakeAuthScope = scope;

    const token = readAccessToken(scope);
    if (token && scoped.headers) {
      scoped.headers.Authorization = `Bearer ${token}`;
    }
    return scoped;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const scoped = response.config as ScopedConfig;
    const scope = scoped.__quakeAuthScope ?? activeScope();
    if (!isAuthBootstrapUrl(scoped.url) && readAccessToken(scope)) {
      touchSessionActivity(scope);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as ScopedConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthBootstrapUrl(originalRequest.url)
    ) {
      const scope = originalRequest.__quakeAuthScope ?? activeScope();

      if (isRefreshing[scope]) {
        return new Promise((resolve, reject) => {
          failedQueue[scope].push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing[scope] = true;

      const refreshToken = readRefreshToken(scope);
      if (!refreshToken) {
        endSession(scope, "session_expired");
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });
        const newAccessToken = response.data.access as string;
        const newRefresh =
          typeof response.data.refresh === "string"
            ? response.data.refresh
            : undefined;
        applyRotatedTokens(scope, newAccessToken, newRefresh);
        processQueue(scope, null, newAccessToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(scope, refreshError, null);
        endSession(scope, "session_expired");
        return Promise.reject(refreshError);
      } finally {
        isRefreshing[scope] = false;
      }
    }

    if (error.response) {
      const { status } = error.response;
      if (status === 403) {
        console.error("Access forbidden - insufficient permissions");
      } else if (status === 404) {
        console.error("Resource not found");
      } else if (status === 500) {
        console.error("Server error");
      }
    } else if (error.request) {
      console.error("Network error - no response received");
    }

    return Promise.reject(error);
  },
);

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export const api = {
  get: <T>(url: string, params?: object) =>
    apiClient.get<T>(url, { params }).then((res) => res.data),

  post: <T>(url: string, data?: unknown) =>
    apiClient.post<T>(url, data).then((res) => res.data),

  put: <T>(url: string, data?: unknown) =>
    apiClient.put<T>(url, data).then((res) => res.data),

  patch: <T>(url: string, data?: unknown) =>
    apiClient.patch<T>(url, data).then((res) => res.data),

  delete: <T>(url: string) => apiClient.delete<T>(url).then((res) => res.data),
};

export default apiClient;
