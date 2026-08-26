/**
 * Platform superadmin API — org list, all users, service toggles.
 */

import { api } from "@/lib/api";
import type { EnabledServices, ServiceKey } from "@/lib/enabled-services";

export interface SuperadminOrgListItem {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  userCount: number;
  ownerEmail: string | null;
  enabledServices: EnabledServices;
}

export interface SuperadminOrgMember {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  isSuperuser?: boolean;
  name: string;
  dateJoined: string;
  organizationId?: string | null;
  organizationName?: string | null;
}

export interface SuperadminOrgDetail extends SuperadminOrgListItem {
  updatedAt?: string;
  members: SuperadminOrgMember[];
  serviceLabels?: Record<string, string>;
}

export interface SuperadminOrgListResponse {
  results: SuperadminOrgListItem[];
  serviceLabels?: Record<string, string>;
}

export interface SuperadminUserListResponse {
  results: SuperadminOrgMember[];
  count: number;
}

export const superadminService = {
  me: () => api.get<{ isSuperuser: boolean }>("/superadmin/me/"),

  listOrganizations: (q?: string) => {
    const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return api.get<SuperadminOrgListResponse>(
      `/superadmin/organizations/${params}`,
    );
  },

  listUsers: (q?: string) => {
    const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return api.get<SuperadminUserListResponse>(`/superadmin/users/${params}`);
  },

  getOrganization: (id: string) =>
    api.get<SuperadminOrgDetail>(`/superadmin/organizations/${id}/`),

  patchServices: (id: string, patch: Partial<Record<ServiceKey, boolean>>) =>
    api.patch<{ id: string; enabledServices: EnabledServices }>(
      `/superadmin/organizations/${id}/services/`,
      patch,
    ),
};
