"use client";

import * as React from "react";
import { Barcode, AlertCircle, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart, Product } from "./cart-context";
import { useProducts } from "@/hooks";
import { salesService } from "@/services/sales.service";
import { usePosStore } from "@/features/pos/store/usePosStore";

interface BarcodeInputProps {
  onProductFound?: (product: Product) => void;
  /** When set, barcode lookup uses POST /sales/scan/ (warehouse stock). */
  warehouseId?: string | null;
}

function scanResponseToProduct(
  row: Awaited<ReturnType<typeof salesService.scanBarcode>>,
): Product {
  const gst =
    parseFloat(row.gst_percentage || row.pricing?.gst_percentage || "0") || 0;
  const cost = parseFloat(row.pricing?.cost_price || "0") || 0;
  return {
    id: row.product_id,
    name: row.product_name,
    sku: row.sku,
    barcode: row.barcode,
    pricing: {
      sellingPrice: parseFloat(row.selling_price) || 0,
      costPrice: cost,
      gstPercentage: gst,
    },
    stock: row.available_stock,
    category: "",
    size: row.size ?? null,
    color: row.color ?? null,
    productName: row.product_name,
  };
}

export function BarcodeInput({ onProductFound, warehouseId }: BarcodeInputProps) {
  const [value, setValue] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { addItem } = useCart();

  const { data: productsResponse } = useProducts({});

  const findProductByCode = React.useCallback(
    (code: string): Product | undefined => {
      if (!productsResponse?.results) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const products = productsResponse.results as any[];
      const found = products.find(
        (p) =>
          p.barcode === code ||
          p.sku?.toLowerCase() === code.toLowerCase(),
      );
      if (!found) return undefined;

      const pricing = found.pricing || {};
      const sellingPrice =
        pricing.sellingPrice ||
        pricing.selling_price ||
        found.sellingPrice ||
        found.selling_price ||
        0;
      const gstPercentage =
        pricing.gstPercentage ||
        pricing.gst_percentage ||
        found.gstPercentage ||
        found.gst_percentage ||
        0;
      const costPrice =
        pricing.costPrice ||
        pricing.cost_price ||
        found.costPrice ||
        found.cost_price ||
        0;

      return {
        id: String(found.id),
        name: found.name || found.productName || "",
        sku: found.sku || "",
        barcode: found.barcode || "",
        pricing: {
          sellingPrice: parseFloat(sellingPrice) || 0,
          costPrice: parseFloat(costPrice) || 0,
          gstPercentage: parseFloat(gstPercentage) || 0,
        },
        stock: found.stock || found.totalStock || found.availableStock || found.available_stock || 0,
        category: found.category || "",
      };
    },
    [productsResponse],
  );

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;

    const code = value.trim();
    const cartQtyFor = (productId: string) =>
      usePosStore
        .getState()
        .cart.items.find((i) => i.product.id === productId)?.quantity ?? 0;

    if (warehouseId) {
      try {
        const row = await salesService.scanBarcode({
          barcode: code,
          warehouse_id: warehouseId,
        });
        const inCart = cartQtyFor(row.product_id);
        const available = row.available_stock;
        if (!row.can_fulfill || available <= 0) {
          setStatus("error");
          setErrorMessage("Insufficient stock or unavailable");
        } else if (inCart >= available) {
          setStatus("error");
          setErrorMessage(`Only ${available} in stock (already in cart)`);
        } else {
          const product = scanResponseToProduct(row);
          const result = addItem(product);
          if (!result.ok) {
            setStatus("error");
            setErrorMessage(
              result.reason === "out_of_stock"
                ? "Product is out of stock"
                : `Only ${result.available} in stock`,
            );
          } else {
            setStatus("success");
            onProductFound?.(product);
          }
        }
      } catch {
        setStatus("error");
        setErrorMessage("Product not found");
      }
    } else {
      const product = findProductByCode(code);
      if (product) {
        const result = addItem(product);
        if (!result.ok) {
          setStatus("error");
          setErrorMessage(
            result.reason === "out_of_stock"
              ? "Product is out of stock"
              : `Only ${result.available} in stock`,
          );
        } else {
          setStatus("success");
          onProductFound?.(product);
        }
      } else {
        setStatus("error");
        setErrorMessage("Product not found");
      }
    }

    setTimeout(() => {
      setValue("");
      setStatus("idle");
      setErrorMessage("");
      inputRef.current?.focus();
    }, 1500);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative">
        <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] stroke-[1.5]" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            warehouseId
              ? "Scan barcode…"
              : "Scan barcode or type code…"
          }
          className={`
            w-full pl-12 pr-12 py-4 rounded-xl text-lg
            bg-[var(--bg-surface)] border-2 transition-all duration-200
            text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
            focus:outline-none
            ${status === "success"
              ? "border-[#c4a574] ring-4 ring-[#c4a574]/20"
              : status === "error"
                ? "border-[#c45c5c] ring-4 ring-[#c45c5c]/20"
                : "border-white/[0.08] focus:border-[#c4a574] focus:ring-4 focus:ring-[#c4a574]/20"
            }
          `}
        />

        <AnimatePresence>
          {status !== "idle" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              {status === "success" ? (
                <CheckCircle className="w-6 h-6 text-[#c4a574]" />
              ) : (
                <AlertCircle className="w-6 h-6 text-[#c45c5c]" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {status === "error" && errorMessage && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-0 top-full mt-2 text-sm text-[#c45c5c]"
          >
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
