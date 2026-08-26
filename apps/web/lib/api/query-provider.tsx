"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import * as React from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't refetch on window focus in development
        refetchOnWindowFocus: process.env.NODE_ENV === "production",
        // Stale time before refetch
        staleTime: 30 * 1000, // 30 seconds
        // Retry failed requests
        retry: 1,
        // Cache time
        gcTime: 5 * 60 * 1000, // 5 minutes
      },
      mutations: {
        // Retry mutations once
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: reuse client
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
  }
}

/** Drop all cached API data on login/logout so org A never sees org B's KPIs. */
export function clearAppQueryCache() {
  if (typeof window === "undefined") return;
  browserQueryClient?.clear();
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
