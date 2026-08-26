/**
 * Customers CRM hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customersService,
  CustomerListParams,
  CustomerUpdatePayload,
  CustomerUpsertPayload,
  CustomerWritePayload,
} from "@/services/customers.service";
import { toast } from "sonner";

export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (params?: CustomerListParams) =>
    [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
  sales: (id: string) => [...customerKeys.detail(id), "sales"] as const,
  summary: () => [...customerKeys.all, "summary"] as const,
  segments: () => [...customerKeys.all, "segments"] as const,
};

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: Record<string, unknown> } })
      .response?.data;
    if (!data) return fallback;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.error === "string") return data.error;
    if (
      data.error &&
      typeof data.error === "object" &&
      data.error !== null &&
      "message" in data.error &&
      typeof (data.error as { message: unknown }).message === "string"
    ) {
      return (data.error as { message: string }).message;
    }
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && typeof val[0] === "string") return val[0];
      if (typeof val === "string") return val;
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useCustomers(params?: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customersService.list(params),
    staleTime: 15000,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => customersService.get(id),
    enabled: !!id,
  });
}

export function useCustomerSales(id: string) {
  return useQuery({
    queryKey: customerKeys.sales(id),
    queryFn: () => customersService.sales(id),
    enabled: !!id,
  });
}

export function useCustomerHubSummary() {
  return useQuery({
    queryKey: customerKeys.summary(),
    queryFn: () => customersService.summary(),
    staleTime: 30000,
  });
}

export function useCustomerSegments() {
  return useQuery({
    queryKey: customerKeys.segments(),
    queryFn: () => customersService.segments(),
    staleTime: 30000,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CustomerWritePayload) => customersService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success("Customer added");
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Failed to add customer"));
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: CustomerUpdatePayload;
    }) => customersService.update(id, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(vars.id) });
      toast.success("Customer updated");
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Failed to update customer"));
    },
  });
}

export function useDeactivateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => customersService.deactivate(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      toast.success("Customer deactivated");
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Failed to deactivate customer"));
    },
  });
}

export function useActivateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => customersService.activate(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      toast.success("Customer reactivated");
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Failed to reactivate customer"));
    },
  });
}

export function useUpsertCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CustomerUpsertPayload) => customersService.upsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Could not save customer"));
    },
  });
}

export function useLinkCustomerSales() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => customersService.linkSales(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.sales(id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.summary() });
      toast.success("Matched invoice sales linked");
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Could not link sales"));
    },
  });
}

export function useSyncCustomersFromSales() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => customersService.syncFromSales(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success(
        `Synced invoices → Customers (${result.totalCustomers} unique` +
          (result.duplicatesMerged
            ? `, merged ${result.duplicatesMerged}`
            : "") +
          `)`,
      );
    },
    onError: (error: unknown) => {
      toast.error(extractErrorMessage(error, "Sync from invoices failed"));
    },
  });
}
