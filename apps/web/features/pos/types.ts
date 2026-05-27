/** POS cart line pricing snapshot (matches backend snapshot semantics). */
export interface ProductPricing {
  sellingPrice: number;
  costPrice?: number;
  gstPercentage: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  pricing: ProductPricing;
  stock: number;
  category: string;
  size?: string | null;
  color?: string | null;
  productName?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface DiscountPreset {
  type: "PERCENT" | "FLAT";
  value: number;
  label: string;
}

export interface AppliedDiscount {
  type: "PERCENT" | "FLAT" | "NONE";
  value: number;
  label: string;
}
