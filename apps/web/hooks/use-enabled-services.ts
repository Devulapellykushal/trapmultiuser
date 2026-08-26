/**
 * Optional hook for organization module entitlements.
 */

import { useAuthStore } from "@/lib/auth";
import {
  isServiceEnabled,
  mergeEnabledServices,
  type ServiceKey,
} from "@/lib/enabled-services";

export function useEnabledServices() {
  const enabledServices = useAuthStore((s) => s.user?.enabledServices);
  const merged = mergeEnabledServices(enabledServices);
  return {
    enabledServices: merged,
    hasService: (key: ServiceKey) => isServiceEnabled(enabledServices, key),
  };
}
