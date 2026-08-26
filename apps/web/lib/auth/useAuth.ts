/**
 * useAuth Hook - Convenience hook for auth state and actions.
 */

import { useAuthStore } from "./auth.store";
import {
  isServiceEnabled,
  type ServiceKey,
} from "@/lib/enabled-services";

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    hasHydrated,
    hasBootstrapped,
    login,
    register,
    logout,
    checkAuth,
  } = useAuthStore();

  const role = user?.role ?? null;

  return {
    user,
    isAuthenticated,
    isLoading,
    hasHydrated,
    hasBootstrapped,
    role,
    isAdmin: role === "ADMIN",
    isStaff: role === "STAFF",
    isSuperuser: Boolean(user?.isSuperuser),
    canViewReports: role === "ADMIN",
    enabledServices: user?.enabledServices,
    hasService: (key: ServiceKey) =>
      isServiceEnabled(user?.enabledServices, key),
    login,
    register,
    logout,
    checkAuth,
  };
}

export default useAuth;
