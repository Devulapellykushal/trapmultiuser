"use client";

import { useAuthStore } from "@/lib/auth/auth.store";
import {
  getIndustryProfile,
  normalizeIndustryId,
  type IndustryId,
  type IndustryProfile,
} from "./profiles";

export function useIndustryProfile(): IndustryProfile {
  const industry = useAuthStore((s) => s.user?.industry);
  return getIndustryProfile(industry);
}

export function useIndustryId(): IndustryId {
  const industry = useAuthStore((s) => s.user?.industry);
  return normalizeIndustryId(industry);
}
