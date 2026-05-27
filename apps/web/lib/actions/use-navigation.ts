"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ADMIN_BASE, adminHref } from "@/lib/admin-routes";

/**
 * Centralized navigation hook for all page transitions.
 * Ensures consistent navigation behavior across the app.
 */
export function useNavigation() {
  const router = useRouter();

  const navigate = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  // Dashboard Quick Actions
  const goToNewSale = useCallback(() => navigate("/pos"), [navigate]);
  const goToAddProduct = useCallback(
    () => navigate(`${adminHref("/inventory")}?openAddProduct=true`),
    [navigate],
  );
  const goToInvoices = useCallback(() => navigate(adminHref("/invoices")), [navigate]);
  const goToAnalytics = useCallback(() => navigate(adminHref("/analytics")), [navigate]);
  const goToInventory = useCallback(() => navigate(adminHref("/inventory")), [navigate]);
  const goToDashboard = useCallback(() => navigate(ADMIN_BASE), [navigate]);
  const goToSettings = useCallback(() => navigate(adminHref("/settings")), [navigate]);

  // Detail views
  const goToProduct = useCallback((productId: string | number) => {
    navigate(`${adminHref("/inventory")}/${productId}`);
  }, [navigate]);

  const goToInvoice = useCallback((invoiceId: string | number) => {
    navigate(`${adminHref("/invoices")}/${invoiceId}`);
  }, [navigate]);

  const goToReceipt = useCallback((saleId: string | number) => {
    navigate(`/pos?receipt=${saleId}`);
  }, [navigate]);

  // Auth (stub for now)
  const goToLogin = useCallback(() => {
    // Clear any auth state here in future
    navigate("/login");
  }, [navigate]);

  return {
    navigate,
    goToNewSale,
    goToAddProduct,
    goToInvoices,
    goToAnalytics,
    goToInventory,
    goToDashboard,
    goToSettings,
    goToProduct,
    goToInvoice,
    goToReceipt,
    goToLogin,
  };
}
