/**
 * Notifications Service
 *
 * Handles API calls for notifications, low stock alerts, and settings.
 */

import { api } from "@/lib/api";

// Types
export interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type:
    | "LOW_STOCK"
    | "RESTOCK_REMINDER"
    | "SALE_COMPLETED"
    | "PO_RECEIVED"
    | "SYSTEM";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  product_id?: string;
  product_name?: string;
  product_sku?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  current_stock?: number;
  threshold?: number;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  expires_at?: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

export interface UnreadCountResponse {
  unread_count: number;
  by_type: Record<string, number>;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  /** Variant line from API (e.g. size · color) */
  variant_details?: string | null;
  warehouse_id: string;
  warehouse_name: string;
  current_stock: number;
  reorder_threshold: number;
  deficit: number;
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface LowStockResponse {
  count: number;
  items: LowStockItem[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface NotificationSettings {
  email_low_stock_alerts: boolean;
  email_daily_summary: boolean;
  low_stock_email_recipients: string;
  whatsapp_invoice_enabled: boolean;
  whatsapp_business_number: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_use_tls: boolean;
  smtp_from_email: string;
}

export interface NotificationSettingsUpdate extends Partial<NotificationSettings> {
  smtp_password?: string;
}

// API Functions

/**
 * Get all notifications
 */
export async function getNotifications(params?: {
  type?: string;
  is_read?: boolean;
  priority?: string;
  limit?: number;
}): Promise<NotificationsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.type) searchParams.set("type", params.type);
  if (params?.is_read !== undefined)
    searchParams.set("is_read", String(params.is_read));
  if (params?.priority) searchParams.set("priority", params.priority);
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const url = queryString
    ? `/notifications/?${queryString}`
    : "/notifications/";

  return api.get<NotificationsResponse>(url);
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<UnreadCountResponse> {
  return api.get<UnreadCountResponse>("/notifications/unread-count/");
}

/**
 * Get a single notification
 */
export async function getNotification(id: string): Promise<Notification> {
  return api.get<Notification>(`/notifications/${id}/`);
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(
  notificationIds?: string[],
): Promise<{ marked_read: number; unread_count: number }> {
  return api.post<{ marked_read: number; unread_count: number }>(
    "/notifications/mark-read/",
    notificationIds ? { notification_ids: notificationIds } : {},
  );
}

/**
 * Delete a notification
 */
export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}/`);
}

/**
 * Get low stock products
 */
export async function getLowStockProducts(
  warehouseId?: string,
): Promise<LowStockResponse> {
  const url = warehouseId
    ? `/notifications/low-stock/?warehouse_id=${warehouseId}`
    : "/notifications/low-stock/";

  return api.get<LowStockResponse>(url);
}

/**
 * Check low stock and create notifications
 */
export async function checkLowStock(params?: {
  warehouse_id?: string;
  send_email?: boolean;
}): Promise<{
  low_stock_count: number;
  notifications_created: number;
  emails_sent: number;
  emails_failed: number;
}> {
  return api.post("/notifications/low-stock/", params || {});
}

/**
 * Get notification settings
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  return api.get<NotificationSettings>("/notifications/settings/");
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  settings: NotificationSettingsUpdate,
): Promise<NotificationSettings> {
  return api.patch<NotificationSettings>("/notifications/settings/", settings);
}

/**
 * Send test email
 */
export async function sendTestEmail(toEmail: string): Promise<{
  success: boolean;
  message: string;
  details: unknown;
}> {
  return api.post("/notifications/email/test/", { to_email: toEmail });
}

/**
 * Send invoice via WhatsApp
 */
export async function sendWhatsAppInvoice(params: {
  sale_id: string;
  phone_number: string;
  custom_message?: string;
}): Promise<{
  success: boolean;
  message: string;
  details: unknown;
}> {
  return api.post("/notifications/whatsapp/invoice/", params);
}

/**
 * Send custom WhatsApp message
 */
export async function sendWhatsAppMessage(params: {
  phone_number: string;
  message: string;
}): Promise<{
  success: boolean;
  message: string;
  details: unknown;
}> {
  return api.post("/notifications/whatsapp/send/", params);
}
