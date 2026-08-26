/**
 * Product bulk-import column guide + industry example rows.
 * Must stay aligned with apps/api/inventory/bulk_import.py IMPORT_COLUMNS.
 */

import type { IndustryId } from "@/lib/industry";

export type ImportColumnDef = {
  key: string;
  required: boolean;
  meaning: string;
};

/** Canonical headers — same order as API template. */
export const IMPORT_COLUMN_DEFS: readonly ImportColumnDef[] = [
  {
    key: "warehouse_code",
    required: false,
    meaning: "Active godown/shop code, or blank to use Default warehouse below",
  },
  { key: "name", required: true, meaning: "Product name (required)" },
  { key: "brand", required: true, meaning: "Brand / maker (required)" },
  { key: "category", required: true, meaning: "Category name (required)" },
  { key: "description", required: false, meaning: "Short description" },
  { key: "product_code", required: false, meaning: "Your internal item code" },
  { key: "brand_code", required: false, meaning: "Maker’s style / brand code" },
  { key: "alias", required: false, meaning: "Search alias / short name" },
  { key: "country_of_origin", required: false, meaning: "e.g. IN" },
  {
    key: "gender",
    required: false,
    meaning: "MENS, WOMENS, UNISEX, or KIDS (default UNISEX)",
  },
  { key: "material", required: false, meaning: "Fabric / material" },
  { key: "season", required: false, meaning: "e.g. SS26" },
  {
    key: "attributes_json",
    required: false,
    meaning: 'JSON object, e.g. {"sizes":["205/55 R16"]} — or leave blank',
  },
  {
    key: "supplier_code",
    required: false,
    meaning: "Must match an existing supplier code if set",
  },
  { key: "is_active", required: false, meaning: "true / false (default true)" },
  {
    key: "product_sku",
    required: false,
    meaning: "Leave blank to auto-generate",
  },
  {
    key: "product_barcode",
    required: false,
    meaning: "Leave blank to auto-generate",
  },
  { key: "pricing_cost_price", required: false, meaning: "Your cost (₹)" },
  { key: "pricing_mrp", required: false, meaning: "MRP / tag price (₹)" },
  {
    key: "pricing_selling_price",
    required: false,
    meaning: "Counter selling price (₹)",
  },
  {
    key: "pricing_gst_percentage",
    required: false,
    meaning: "GST % e.g. 5, 12, 18",
  },
  {
    key: "variant_sku",
    required: false,
    meaning: "Variant SKU — blank to auto-generate",
  },
  {
    key: "variant_size",
    required: false,
    meaning: "Size / pack / portion / sidewall marking",
  },
  { key: "variant_color", required: false, meaning: "Color if applicable" },
  { key: "variant_cost_price", required: false, meaning: "Variant cost (₹)" },
  {
    key: "variant_selling_price",
    required: false,
    meaning: "Variant sell price (₹)",
  },
  {
    key: "variant_reorder_threshold",
    required: false,
    meaning: "Low-stock alert qty",
  },
  {
    key: "initial_stock",
    required: false,
    meaning: "Opening qty (needs warehouse_code or Default warehouse)",
  },
] as const;

export type ImportExampleRow = Record<string, string>;

function row(partial: ImportExampleRow): ImportExampleRow {
  const full: ImportExampleRow = {};
  for (const col of IMPORT_COLUMN_DEFS) {
    full[col.key] = partial[col.key] ?? "";
  }
  return full;
}

const EXAMPLES: Record<IndustryId, ImportExampleRow[]> = {
  auto_tyre: [
    row({
      name: "MRF Wanderer Sport",
      brand: "MRF",
      category: "Tyre",
      description: "Tubeless passenger car tyre",
      product_code: "MRF-WS-205",
      attributes_json: '{"sizeFormat":"TYRE_SIDEWALL","sizes":["205/55 R16"]}',
      is_active: "true",
      pricing_cost_price: "4200",
      pricing_mrp: "5999",
      pricing_selling_price: "5499",
      pricing_gst_percentage: "18",
      variant_size: "205/55 R16",
      variant_reorder_threshold: "4",
      initial_stock: "12",
    }),
    row({
      name: "Alloy Wheel 16x6.5J",
      brand: "Local",
      category: "Rim",
      is_active: "true",
      pricing_cost_price: "2800",
      pricing_mrp: "4500",
      pricing_selling_price: "3999",
      pricing_gst_percentage: "18",
      variant_size: '16"',
      initial_stock: "6",
    }),
  ],
  fmcg: [
    row({
      name: "Parle-G Glucose Biscuits",
      brand: "Parle",
      category: "Biscuits",
      description: "Family pack",
      product_code: "PG-800",
      attributes_json: '{"sizes":["800g"]}',
      is_active: "true",
      pricing_cost_price: "45",
      pricing_mrp: "60",
      pricing_selling_price: "58",
      pricing_gst_percentage: "5",
      variant_size: "800g",
      variant_reorder_threshold: "24",
      initial_stock: "48",
    }),
    row({
      name: "Tata Salt",
      brand: "Tata",
      category: "Staples",
      is_active: "true",
      pricing_cost_price: "22",
      pricing_mrp: "28",
      pricing_selling_price: "26",
      pricing_gst_percentage: "5",
      variant_size: "1kg",
      initial_stock: "100",
    }),
  ],
  fnb: [
    row({
      name: "Masala Chai",
      brand: "House",
      category: "Hot drinks",
      is_active: "true",
      pricing_cost_price: "8",
      pricing_mrp: "40",
      pricing_selling_price: "40",
      pricing_gst_percentage: "5",
      variant_size: "Regular",
      initial_stock: "0",
    }),
    row({
      name: "Cold Coffee",
      brand: "House",
      category: "Cold drinks",
      is_active: "true",
      pricing_cost_price: "25",
      pricing_mrp: "120",
      pricing_selling_price: "120",
      pricing_gst_percentage: "5",
      variant_size: "Large",
      initial_stock: "0",
    }),
  ],
  general: [
    row({
      name: "Cotton Tee Navy",
      brand: "Quake",
      category: "Apparel",
      material: "100% Cotton",
      gender: "UNISEX",
      attributes_json: '{"sizes":["S","M","L"],"colors":["Navy"]}',
      is_active: "true",
      pricing_cost_price: "250",
      pricing_mrp: "599",
      pricing_selling_price: "499",
      pricing_gst_percentage: "5",
      variant_size: "M",
      variant_color: "Navy",
      variant_reorder_threshold: "10",
      initial_stock: "20",
    }),
    row({
      name: "Sample Polo",
      brand: "Quake",
      category: "Apparel",
      gender: "MENS",
      is_active: "true",
      pricing_cost_price: "400",
      pricing_mrp: "1299",
      pricing_selling_price: "999",
      pricing_gst_percentage: "12",
      variant_size: "L",
      variant_color: "Black",
      initial_stock: "24",
    }),
  ],
};

export function getImportExamples(industry: IndustryId): ImportExampleRow[] {
  return EXAMPLES[industry] ?? EXAMPLES.general;
}

/** Columns worth showing in the compact example table (full list stays in the guide). */
export const EXAMPLE_TABLE_KEYS = [
  "name",
  "brand",
  "category",
  "variant_size",
  "pricing_selling_price",
  "pricing_gst_percentage",
  "initial_stock",
  "warehouse_code",
] as const;
