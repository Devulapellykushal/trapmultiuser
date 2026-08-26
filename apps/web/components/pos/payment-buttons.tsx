"use client";

import * as React from "react";
import { CreditCard, Banknote } from "lucide-react";
import { motion } from "framer-motion";
import { useCart } from "./cart-context";

interface PaymentButtonsProps {
  onPayment: (method: "cash" | "card") => void;
}

export function PaymentButtons({ onPayment }: PaymentButtonsProps) {
  const { items } = useCart();
  const isEmpty = items.length === 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => onPayment("card")}
        disabled={isEmpty}
        className={`
          flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-base
          transition-all duration-200
          ${isEmpty
            ? "bg-white/[0.03] border border-white/[0.06] text-[#8a867c] cursor-not-allowed"
            : "bg-white/[0.05] border border-white/[0.08] text-[var(--text-primary)] hover:bg-white/[0.08] hover:border-white/[0.12]"
          }
        `}
      >
        <CreditCard className="w-6 h-6" />
        Card
      </motion.button>
      
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => onPayment("cash")}
        disabled={isEmpty}
        className={`
          flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-base
          transition-all duration-200
          ${isEmpty
            ? "bg-[#c4a574]/30 text-white/50 cursor-not-allowed"
            : "bg-[#c4a574] text-white hover:bg-[#c4a574] shadow-lg shadow-[#c4a574]/20"
          }
        `}
      >
        <Banknote className="w-6 h-6" />
        Cash
      </motion.button>
    </div>
  );
}
