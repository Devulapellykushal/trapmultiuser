"use client";

import { apiClient } from "@/lib/api";
import { formatDateTimeIST } from "@/lib/invoices/format-ist";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Printer, X } from "lucide-react";
import * as React from "react";

// Invoice types
interface InvoiceItem {
  productId: string;
  name: string;
  sku?: string;
  variantDetails?: string;
  quantity: number;
  unitPrice?: number;
  total: number;
  gstPercentage?: number;
  gstAmount?: number;
}

interface PaymentDetail {
  method: string;
  amount: number;
}

interface InvoiceWarehouse {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  sellerImageUrl?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  time?: string;
  /** ISO instant for IST date+time on the printed header. */
  occurredAtIso?: string;
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
  };
  items: InvoiceItem[];
  subtotal?: number;
  discount?: number;
  discountType?: string;
  discountPercent?: number;
  gstTotal?: number;
  total: number;
  paymentMethod: "cash" | "card" | "upi" | "credit";
  paymentMethods?: PaymentDetail[];
  status: "paid" | "cancelled" | "refunded" | "credit";
  cashier?: string;
  warehouse?: InvoiceWarehouse | null;
}

const RUPEE = "\u20B9";

/**
 * Legal / company defaults for GST, state line, bank, and signatory — aligned
 * with `apps/api/invoices/pdf/seller_context.py` until BusinessSettings is wired here.
 */
const PRINT_LEGAL = {
  legalEntityName: "Thirumala Wheels",
  addressLines: [
    "P No 385, Ground Floor",
    "Film Nagar, Jubilee Hills",
    "Hyderabad-500033",
  ] as string[],
  gstin: "",
  stateLine: "State Name : Telangana",
  bankName: "ICICI Bank Account - OD",
  bankAccount: "041005006897",
  bankIfsc: "ICIC0000410",
};

function warehouseAddressLines(address: string | undefined): string[] {
  if (!address?.trim()) return [];
  const lines: string[] = [];
  for (const part of address.replace(/\r\n/g, "\n").split("\n")) {
    const s = part.trim();
    if (s) lines.push(s);
  }
  return lines;
}

function resolvePrintedSeller(invoice: Invoice) {
  const wh = invoice.warehouse;
  const whName = wh?.name?.trim();
  const sellerTitle = whName || PRINT_LEGAL.legalEntityName;

  const whAddr = wh?.address?.trim();
  const addressLines = whAddr
    ? warehouseAddressLines(whAddr)
    : [...PRINT_LEGAL.addressLines];

  const whHasBank = Boolean(
    wh?.bankName?.trim() || wh?.bankAccount?.trim() || wh?.bankIfsc?.trim(),
  );
  let bankName = PRINT_LEGAL.bankName;
  let bankAccount = PRINT_LEGAL.bankAccount;
  let bankIfsc = PRINT_LEGAL.bankIfsc;
  if (whHasBank && wh) {
    bankName = wh.bankName?.trim() || PRINT_LEGAL.bankName;
    bankAccount = wh.bankAccount?.trim() || PRINT_LEGAL.bankAccount;
    bankIfsc = wh.bankIfsc?.trim() || PRINT_LEGAL.bankIfsc;
  }

  const contactLines: string[] = [];
  const em = wh?.email?.trim();
  const ph = wh?.phone?.trim();
  if (em) contactLines.push(`E-mail : ${em}`);
  if (ph) contactLines.push(`Mobile : ${ph}`);

  return {
    sellerTitle,
    addressLines,
    contactLines,
    sellerImageUrl: wh?.sellerImageUrl?.trim() || undefined,
    gstin: PRINT_LEGAL.gstin,
    stateLine: PRINT_LEGAL.stateLine,
    bankName,
    bankAccount,
    bankIfsc,
    signatoryName: PRINT_LEGAL.legalEntityName,
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function formatCurrency(amount: number): string {
  return `${RUPEE} ${formatAmount(amount)}`;
}

function formatInvoiceDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()] || "";
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function toPaymentLabel(method?: string): string {
  const normalized = (method || "").toUpperCase();
  switch (normalized) {
    case "CASH":
    case "cash":
      return "Cash";
    case "CARD":
    case "card":
      return "Card";
    case "UPI":
    case "upi":
      return "UPI";
    case "CREDIT":
    case "credit":
      return "Credit";
    default:
      return method || "Cash";
  }
}

function amountToIndianWords(amount: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const twoDigits = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n] || "";
    const ten = tens[Math.floor(n / 10)] || "";
    const one = ones[n % 10] || "";
    return `${ten}${one ? ` ${one}` : ""}`.trim();
  };

  const threeDigits = (n: number): string => {
    if (n === 0) return "";
    if (n < 100) return twoDigits(n);
    const hundred = ones[Math.floor(n / 100)] || "";
    const remainder = n % 100;
    return `${hundred} Hundred${remainder ? ` ${twoDigits(remainder)}` : ""}`.trim();
  };

  const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  let rupees = Math.floor(safeAmount);
  const paise = Math.round((safeAmount - rupees) * 100);

  if (rupees === 0 && paise === 0) {
    return "Zero";
  }

  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  const remainder = rupees;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (remainder) parts.push(threeDigits(remainder));

  let words = parts.join(" ").trim();
  if (paise) {
    words += ` and ${twoDigits(paise)} Paise`;
  }
  return words || "Zero";
}

interface InvoicePreviewProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InvoicePreview({
  invoice,
  isOpen,
  onClose,
}: InvoicePreviewProps) {
  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Print: clone sheet to body so print engines are not affected by hidden
  // ancestors (e.g. Framer motion) inside the modal tree. Same path is used
  // when PDF download fails so "Save as PDF" is not the whole invoices page.
  const printInvoiceSheet = React.useCallback(() => {
    const el = document.getElementById("invoice-print-root");
    if (!el) {
      window.print();
      return;
    }
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("invoice-print-clone");
    document.body.appendChild(clone);

    document.documentElement.classList.add("invoice-print-active");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.documentElement.classList.remove("invoice-print-active");
      clone.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(cleanup, 3_000);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  }, []);

  const handlePrint = () => {
    printInvoiceSheet();
  };

  const [isDownloading, setIsDownloading] = React.useState(false);
  const handleDownload = async () => {
    if (!invoice) return;
    setIsDownloading(true);
    try {
      const response = await apiClient.get(`/invoices/${invoice.id}/pdf/`, {
        responseType: "blob",
        headers: { Accept: "application/pdf,*/*" },
      });

      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: "application/pdf" });

      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const isPdf =
        head.length === 4 &&
        head[0] === 0x25 &&
        head[1] === 0x50 &&
        head[2] === 0x44 &&
        head[3] === 0x46;
      if (!isPdf) {
        throw new Error("Not a PDF response");
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      printInvoiceSheet();
    } finally {
      setIsDownloading(false);
    }
  };

  if (!invoice) return null;

  const printed = resolvePrintedSeller(invoice);

  const formattedDate = invoice.occurredAtIso
    ? formatDateTimeIST(invoice.occurredAtIso)
    : formatInvoiceDate(invoice.date);
  const paymentTerms =
    invoice.paymentMethods && invoice.paymentMethods.length > 0
      ? invoice.paymentMethods.map((p) => toPaymentLabel(p.method)).join(", ")
      : toPaymentLabel(invoice.paymentMethod);

  const customerLine = [invoice.customer.name, invoice.customer.phone]
    .filter(Boolean)
    .join(" ")
    .trim();

  const totalQuantity = invoice.items.reduce(
    (acc, item) => acc + (item.quantity || 0),
    0,
  );

  const isDiscountApplied =
    (invoice.discount || 0) > 0 &&
    !!invoice.discountType &&
    invoice.discountType !== "NONE";

  const discountLabel =
    invoice.discountType === "PERCENT" || invoice.discountType === "PERCENTAGE"
      ? `Discount (${invoice.discountPercent || 0}%)`
      : "Discount";

  const amountWords = `INR ${amountToIndianWords(invoice.total)} Only`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:inset-auto print:block print:p-0">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm print:hidden"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative z-10 w-full max-w-6xl max-h-[90vh] overflow-auto rounded-2xl shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none"
          >
            <div className="bg-[#FAFAFA] text-[#1A1B23] print:bg-white">
              {/* Header Actions */}
              <div className="flex items-center justify-between p-4 bg-[#1A1B23] text-white print:hidden">
                <h2 className="text-lg font-semibold">Invoice Preview</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.1] text-sm hover:bg-white/[0.15] transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#C6A15B] text-[#111111] text-sm font-medium hover:bg-[#D4B06A] transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? "Downloading..." : "Download"}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/[0.1] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-8 print:p-4">
                <div
                  id="invoice-print-root"
                  className="invoice-print-sheet mx-auto w-full max-w-[980px] bg-white border border-[#111111] text-[#111111] [print-color-adjust:exact] print:max-w-none"
                >
                  <div className="border-b border-[#111111] py-2 text-center text-[13px] font-bold tracking-[0.2em] uppercase text-[#111111]">
                    QUAKE INVENTORY SYSTEM
                  </div>
                  <div className="border-b border-[#111111] py-1.5 text-center text-sm font-bold tracking-[0.18em] text-[#111111]">
                    INVOICE
                  </div>

                  <div className="grid grid-cols-12 border-b border-[#111111]">
                    <div className="col-span-7 border-r border-[#111111] p-2.5 text-[11px] leading-snug text-[#111111]">
                      <div className="flex flex-row items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-bold text-[#111111]">
                            {printed.sellerTitle}
                          </div>
                          {printed.addressLines.map((line, i) => (
                            <div key={`${i}-${line}`} className="font-medium">
                              {line}
                            </div>
                          ))}
                          {printed.contactLines.map((line, i) => (
                            <div key={`c-${i}-${line}`} className="font-medium">
                              {line}
                            </div>
                          ))}
                          <div className="mt-0.5 font-semibold">
                            GSTIN/UIN: {printed.gstin}
                          </div>
                          <div className="font-medium">{printed.stateLine}</div>
                        </div>
                        {printed.sellerImageUrl ? (
                          <div className="shrink-0 w-[100px] max-w-[38%] sm:w-[120px]">
                            <div className="flex max-h-[92px] w-full items-center justify-center overflow-hidden rounded border border-[#cccccc] bg-[#f6f6f6] p-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={printed.sellerImageUrl}
                                alt=""
                                className="max-h-[84px] w-auto max-w-full object-contain"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-5">
                      <table className="w-full border-collapse text-[11px] text-[#111111]">
                        <tbody>
                          <tr>
                            <td className="w-1/2 border-r border-b border-[#111111] p-2 align-top">
                              <div className="text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                                Invoice No.
                              </div>
                              <div className="mt-0.5 text-[12px] font-bold leading-tight">
                                {invoice.invoiceNumber || "—"}
                              </div>
                            </td>
                            <td className="w-1/2 border-b border-[#111111] p-2 align-top">
                              <div className="text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                                Dated (IST)
                              </div>
                              <div className="mt-0.5 text-[12px] font-bold leading-tight">
                                {formattedDate}
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td
                              className="border-b border-[#111111] p-2 align-top"
                              colSpan={2}
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                                Mode / Terms of Payment
                              </div>
                              <div className="mt-0.5 text-[12px] font-bold">
                                {paymentTerms}
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border-b border-[#111111] p-2.5 text-[11px] leading-snug text-[#111111]">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                      Buyer (Bill to)
                    </div>
                    <div className="text-[12px] font-bold mt-1 text-[#111111]">
                      {customerLine || "Walk-in Customer"}
                    </div>
                    {invoice.customer.email ? (
                      <div>E-mail : {invoice.customer.email}</div>
                    ) : null}
                    {invoice.customer.address ? (
                      <div>{invoice.customer.address}</div>
                    ) : null}
                    {invoice.customer.gstin ? (
                      <div>GSTIN : {invoice.customer.gstin}</div>
                    ) : null}
                    <div className="mt-1 font-semibold text-[#111111]">
                      State Name : Telangana
                    </div>
                  </div>

                  <table className="w-full border-collapse text-[11px] text-[#111111]">
                    <thead>
                      <tr>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-left font-bold w-[5%] text-[#111111]">
                          Sl
                          <br />
                          No.
                        </th>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-left font-bold w-[40%] text-[#111111]">
                          Description of Goods
                        </th>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center font-bold w-[10%] text-[#111111]">
                          HSN/SAC
                        </th>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center font-bold w-[10%] text-[#111111]">
                          Quantity
                        </th>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-right font-bold w-[11%] text-[#111111]">
                          Rate
                        </th>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center font-bold w-[6%] text-[#111111]">
                          per
                        </th>
                        <th className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center font-bold w-[8%] text-[#111111]">
                          Disc. %
                        </th>
                        <th className="border-b border-[#111111] px-1.5 py-1.5 text-right font-bold w-[10%] text-[#111111]">
                          Amount
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {invoice.items.map((item, index) => {
                        const qty = item.quantity || 0;
                        const rate =
                          qty > 0 ? item.total / qty : item.unitPrice || 0;

                        return (
                          <tr key={`${item.productId}-${index}`}>
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center align-top font-medium">
                              {index + 1}
                            </td>
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 align-top">
                              <div className="font-bold leading-tight text-[#111111]">
                                {(item.name || "").trim() ||
                                  item.sku ||
                                  "Unknown Product"}
                              </div>
                              {item.sku || item.variantDetails ? (
                                <div className="text-[10px] font-medium text-[#3d3d3d] mt-0.5 leading-tight">
                                  {item.sku ? `SKU: ${item.sku}` : ""}
                                  {item.sku && item.variantDetails ? " | " : ""}
                                  {item.variantDetails || ""}
                                </div>
                              ) : null}
                            </td>
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center align-top" />
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center align-top font-bold">
                              {qty} Nos
                            </td>
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-right align-top font-medium">
                              {formatAmount(rate)}
                            </td>
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center align-top font-medium">
                              Nos
                            </td>
                            <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center align-top font-medium">
                              -
                            </td>
                            <td className="border-b border-[#111111] px-1.5 py-1.5 text-right align-top font-bold">
                              {formatAmount(item.total || 0)}
                            </td>
                          </tr>
                        );
                      })}

                      {isDiscountApplied ? (
                        <tr>
                          <td
                            className="border-r border-b border-[#111111] px-1.5 py-1.5 text-right font-medium"
                            colSpan={7}
                          >
                            {discountLabel}
                          </td>
                          <td className="border-b border-[#111111] px-1.5 py-1.5 text-right font-bold">
                            - {formatCurrency(invoice.discount || 0)}
                          </td>
                        </tr>
                      ) : null}

                      <tr>
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5" />
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-right font-bold">
                          Total
                        </td>
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5" />
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5 text-center font-bold">
                          {totalQuantity} Nos
                        </td>
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5" />
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5" />
                        <td className="border-r border-b border-[#111111] px-1.5 py-1.5" />
                        <td className="border-b border-[#111111] px-1.5 py-1.5 text-right font-bold">
                          {formatCurrency(invoice.total || 0)}
                        </td>
                      </tr>

                      <tr>
                        <td
                          className="border-r border-[#111111] px-1.5 py-1.5"
                          colSpan={7}
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                            Amount Chargeable (in words)
                          </div>
                          <div className="text-[12px] font-bold mt-0.5 text-[#111111]">
                            {amountWords}
                          </div>
                        </td>
                        <td className="px-1.5 py-1.5 text-right text-[10px] align-top text-[#111111]">
                          <div className="font-medium italic">E. &amp; O.E.</div>
                          <div className="text-[8px] font-normal not-italic leading-tight mt-0.5 text-[#333333]">
                            Errors &amp; omissions excepted
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="grid grid-cols-12 border-t border-[#111111]">
                    <div className="col-span-7 border-r border-[#111111] p-2.5 text-[11px] leading-snug flex flex-col justify-end min-h-[72px] text-[#111111]">
                      <div className="mb-1 font-bold">Declaration</div>
                      <div className="font-medium">
                        1) Prices are inclusive of taxes. 2) Subject to
                        Hyderabad Jurisdiction. 3) Goods Once sold will not be
                        taken back.
                      </div>
                    </div>

                    <div className="col-span-5 p-2.5 text-[11px] leading-snug min-h-[72px] text-[#111111]">
                      <div className="text-center text-[12px] mb-1 font-bold">
                        Company&apos;s Bank Details
                      </div>
                      <table className="w-full text-[11px] mb-3 font-medium">
                        <tbody>
                          <tr>
                            <td className="w-[45%]">Bank Name</td>
                            <td className="w-[5%]">:</td>
                            <td className="font-bold">
                              {printed.bankName}
                            </td>
                          </tr>
                          <tr>
                            <td>A/c No.</td>
                            <td>:</td>
                            <td className="font-bold">
                              {printed.bankAccount}
                            </td>
                          </tr>
                          <tr>
                            <td>Branch &amp; IFS Code</td>
                            <td>:</td>
                            <td className="font-bold">
                              {printed.bankIfsc}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="text-right font-bold mb-4 text-[#111111]">
                        for {printed.signatoryName}
                      </div>
                      <div className="text-right font-semibold text-[#111111]">
                        Authorised Signatory
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#111111] py-1.5 text-center text-[11px] font-semibold text-[#111111]">
  This is a Computer Generated Invoice - Handled by p4ai.in
</div>

                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
