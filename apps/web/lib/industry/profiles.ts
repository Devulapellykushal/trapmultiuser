/**
 * Industry UX profiles — forms, presets, and labels for the *active* business.
 * Industry is fixed per Organization; switch businesses to change profile + data scope.
 * POS / stock / CRM identity engines stay the same for every industry.
 */

export type IndustryId = "auto_tyre" | "fmcg" | "fnb" | "general";

export const INDUSTRY_OPTIONS: ReadonlyArray<{
  id: IndustryId;
  label: string;
  description: string;
}> = [
  {
    id: "auto_tyre",
    label: "Tyre / auto shop",
    description: "Tyres, tubes, rims — workshop counter",
  },
  {
    id: "fmcg",
    label: "Kirana / grocery",
    description: "Packets, staples, daily retail",
  },
  {
    id: "fnb",
    label: "Cafe / restaurant",
    description: "Food, drinks, kitchen items",
  },
  {
    id: "general",
    label: "Other retail shop",
    description: "Any other shop — clothes, hardware, etc.",
  },
] as const;

export type SizeFormatId = string;

export type IndustryAddProductProfile = {
  step2Title: string;
  step2Hint: string;
  step1Hint: string;
  intro: string;
  nameLabel: string;
  namePlaceholder: string;
  brandLabel: string;
  brandPlaceholder: string;
  /** When empty on save, use this (owners skip typing “House” / “Unbranded”). */
  defaultBrand: string;
  brandRequired: boolean;
  categoryLabel: string;
  categoryPlaceholder: string;
  /** One-tap category chips for speed — still free-type if needed. */
  categorySuggestions: readonly string[];
  productCodeLabel: string;
  productCodePlaceholder: string;
  brandCodeLabel: string;
  brandCodePlaceholder: string;
  aliasLabel: string;
  aliasPlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  /** Shown on step 2 for “I only sell one option”. */
  singleSkuLabel: string;
  singleSkuValue: string;
  sizeFormats: ReadonlyArray<{
    id: SizeFormatId;
    label: string;
    presets: readonly string[];
  }>;
  defaultSizeFormat: SizeFormatId;
};

export type IndustryCrmProfile = {
  showVehicles: boolean;
  layoutBlurb: string;
  gstSegmentLabel: string;
  gstSegmentHint: string;
  whatsappTemplates: ReadonlyArray<{
    id: string;
    label: string;
    body: (name: string) => string;
  }>;
};

export type IndustryProfile = {
  id: IndustryId;
  label: string;
  itemNoun: string;
  itemNounPlural: string;
  variantOptionLabel: string;
  labels: {
    posEmptyHint: string;
    posBarcodeOff: string;
    stockSelect: string;
    stockAdded: (count: number, units: number) => string;
    stockRemoved: (count: number, units: number) => string;
    transferHelp: string;
    transferTick: string;
    transferEmpty: string;
    transferLoading: string;
    barcodeHelpOn: string;
    barcodeHelpOff: string;
    inventoryUpdateTitle: string;
    godownHelp: string;
  };
  addProduct: IndustryAddProductProfile;
  crm: IndustryCrmProfile;
};

const TYRE_SIDEWALL = [
  "145/80 R12",
  "155/65 R13",
  "155/70 R13",
  "155/80 R13",
  "165/70 R14",
  "165/80 R14",
  "175/65 R14",
  "175/65 R15",
  "175/70 R13",
  "185/65 R15",
  "185/70 R14",
  "185/70 R15",
  "195/55 R16",
  "195/60 R15",
  "195/65 R15",
  "205/55 R16",
  "205/60 R16",
  "205/65 R16",
  "215/55 R17",
  "215/60 R16",
  "215/65 R16",
  "225/45 R17",
  "225/50 R17",
  "225/55 R17",
  "225/60 R17",
  "235/55 R18",
  "235/60 R18",
  "255/55 R18",
  "265/65 R17",
  "265/70 R16",
  "90/90 R17",
  "90/100 R10",
  "100/80 R17",
  "100/90 R17",
  "110/70 R17",
  "110/80 R17",
  "120/70 R17",
  "120/80 R17",
  "130/70 R17",
  "140/70 R17",
] as const;

const RIM_SIZE = [
  '13"',
  '14"',
  '15"',
  '16"',
  '17"',
  '18"',
  '19"',
  '20"',
  '21"',
  '22"',
  "14×5.5J",
  "15×6J",
  "16×6.5J",
  "17×7J",
  "18×8J",
  "18×8.5J",
  "19×8.5J",
] as const;

const FMCG_PACKS = [
  "Single",
  "Pack of 4",
  "Pack of 6",
  "Pack of 12",
  "100g",
  "200g",
  "250g",
  "500g",
  "1kg",
  "250ml",
  "500ml",
  "1L",
  "Case",
] as const;

const FNB_PORTIONS = [
  "Regular",
  "Large",
  "Small",
  "Half",
  "Full",
  "250ml",
  "500ml",
  "1L",
  "Single",
  "Combo",
] as const;

const GENERAL_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "One size",
  "Custom",
] as const;

const TYRE_CATEGORIES = [
  "Car radial",
  "2W",
  "SUV",
  "Alloy wheel",
  "Steel rim",
  "Tube",
  "Valve",
  "Oil",
  "Service",
] as const;

const FMCG_CATEGORIES = [
  "Biscuits",
  "Snacks",
  "Soft drinks",
  "Dairy",
  "Staples",
  "Personal care",
  "Household",
  "Tobacco",
  "Other",
] as const;

const FNB_CATEGORIES = [
  "Hot drinks",
  "Cold drinks",
  "Snacks",
  "Meals",
  "Desserts",
  "Combos",
  "Packaged",
  "Other",
] as const;

const GENERAL_CATEGORIES = [
  "Apparel",
  "Accessories",
  "Electronics",
  "Home",
  "Grocery",
  "Other",
] as const;

function nounForms(singular: string, plural: string) {
  return {
    itemNoun: singular,
    itemNounPlural: plural,
    labels: {
      stockSelect: `Tick at least one ${singular}.`,
      stockAdded: (count: number, units: number) =>
        `Added stock to ${count} ${count === 1 ? singular : plural} (${units} units).`,
      stockRemoved: (count: number, units: number) =>
        `Removed stock from ${count} ${count === 1 ? singular : plural} (${units} units).`,
      transferTick: `Tick at least one ${singular} to send.`,
      transferEmpty: `No ${plural} found`,
      transferLoading: `Loading ${plural}…`,
    },
  };
}

const PROFILES: Record<IndustryId, IndustryProfile> = {
  auto_tyre: {
    id: "auto_tyre",
    label: "Auto / Tyre",
    ...nounForms("tyre", "tyres"),
    variantOptionLabel: "Size / marking",
    labels: {
      ...nounForms("tyre", "tyres").labels,
      posEmptyHint: "Search or tap a tyre to add",
      posBarcodeOff: "Barcodes off — search or tap a tyre to add",
      transferHelp:
        "Godown holds bulk. You send tyres to a shop, then that shop sells its own stock.",
      barcodeHelpOn: "Every tyre gets a barcode. Scan at POS. Best if you print labels.",
      barcodeHelpOff: "Skip barcodes. Find tyres by name/search and tap to sell.",
      inventoryUpdateTitle: "Update stock — select tyre + quantity",
      godownHelp:
        "Godown holds bulk. You send tyres to a shop, then that shop sells its own stock.",
    },
    addProduct: {
      step1Hint: "Name, brand, type — under a minute",
      step2Title: "Tyre / rim",
      step2Hint: "Optional — skip if one SKU",
      intro: "Only name, brand, and type are required. Everything else can wait.",
      nameLabel: "Name of the tyre / item",
      namePlaceholder: "e.g. MRF Wanderer 205/55 R16",
      brandLabel: "Brand",
      brandPlaceholder: "e.g. MRF, CEAT, Apollo",
      defaultBrand: "",
      brandRequired: true,
      categoryLabel: "Type",
      categoryPlaceholder: "e.g. Car radial, 2W, Tube…",
      categorySuggestions: TYRE_CATEGORIES,
      productCodeLabel: "Your stock code",
      productCodePlaceholder: "Bay / job card / shelf label",
      brandCodeLabel: "Pattern / article code",
      brandCodePlaceholder: "From sidewall or supplier catalog",
      aliasLabel: "Short POS name",
      aliasPlaceholder: "e.g. OE Swift spare",
      notesLabel: "Notes",
      notesPlaceholder: "Load index, tubeless, DOT, warranty…",
      singleSkuLabel: "One SKU only — skip sizes",
      singleSkuValue: "Standard",
      defaultSizeFormat: "TYRE_SIDEWALL",
      sizeFormats: [
        { id: "TYRE_SIDEWALL", label: "Tyre sidewall", presets: TYRE_SIDEWALL },
        { id: "RIM_SIZE", label: "Rim size", presets: RIM_SIZE },
        { id: "CUSTOM_MARKING", label: "Custom marking", presets: [] },
      ],
    },
    crm: {
      showVehicles: true,
      layoutBlurb:
        "CRM for your tyre counter — every invoice with a phone lands here, ready for WhatsApp and fleet follow-up.",
      gstSegmentLabel: "Fleet / GSTIN",
      gstSegmentHint: "Accounts with a GSTIN on file",
      whatsappTemplates: [
        {
          id: "thanks",
          label: "Thanks for visiting",
          body: (name) =>
            `Hi ${name}, thanks for visiting us. Drive safe — we’re here for your next tyre or alignment.`,
        },
        {
          id: "fit",
          label: "Tyre fit reminder",
          body: (name) =>
            `Hi ${name}, a quick reminder to check tyre pressure and tread. Book a fitment slot with us anytime.`,
        },
        {
          id: "credit",
          label: "Credit reminder",
          body: (name) =>
            `Hi ${name}, a gentle reminder on your open balance with us. Happy to help settle anytime at the counter.`,
        },
      ],
    },
  },
  fmcg: {
    id: "fmcg",
    label: "FMCG",
    ...nounForms("item", "items"),
    variantOptionLabel: "Pack / size",
    labels: {
      ...nounForms("item", "items").labels,
      posEmptyHint: "Search or tap an item to add",
      posBarcodeOff: "Barcodes off — search or tap an item to add",
      transferHelp:
        "Godown holds bulk. Transfer packs to a shop, then that shop sells its own stock.",
      barcodeHelpOn: "Every item can get a barcode. Scan at POS when you print labels.",
      barcodeHelpOff: "Skip barcodes. Find items by name/search and tap to sell.",
      inventoryUpdateTitle: "Update stock — select item + quantity",
      godownHelp:
        "Godown holds bulk. Transfer packs to a shop, then that shop sells its own stock.",
    },
    addProduct: {
      step1Hint: "Name & type — brand optional",
      step2Title: "Pack / size",
      step2Hint: "Optional — skip if one pack size",
      intro: "Tap a type, type the name, done. Optional extras stay hidden.",
      nameLabel: "Product name",
      namePlaceholder: "e.g. Parle-G 800g / Tata Salt 1kg",
      brandLabel: "Brand",
      brandPlaceholder: "e.g. Parle, Nestlé, Britannia",
      defaultBrand: "Unbranded",
      brandRequired: false,
      categoryLabel: "Type",
      categoryPlaceholder: "e.g. Biscuits, Snacks, Dairy…",
      categorySuggestions: FMCG_CATEGORIES,
      productCodeLabel: "Your item code",
      productCodePlaceholder: "Shelf / supplier code",
      brandCodeLabel: "Supplier article",
      brandCodePlaceholder: "From invoice or catalog",
      aliasLabel: "Short POS name",
      aliasPlaceholder: "e.g. Parle 800",
      notesLabel: "Notes",
      notesPlaceholder: "MRP batch tip, shelf life, vendor…",
      singleSkuLabel: "One pack size — skip this",
      singleSkuValue: "Single",
      defaultSizeFormat: "PACK_SIZE",
      sizeFormats: [
        { id: "PACK_SIZE", label: "Pack / weight", presets: FMCG_PACKS },
        { id: "CUSTOM_MARKING", label: "Custom option", presets: [] },
      ],
    },
    crm: {
      showVehicles: false,
      layoutBlurb:
        "CRM for your counter — every invoice with a phone lands here for WhatsApp and credit follow-up.",
      gstSegmentLabel: "B2B / GSTIN",
      gstSegmentHint: "Buyers with a GSTIN on file",
      whatsappTemplates: [
        {
          id: "thanks",
          label: "Thanks for shopping",
          body: (name) =>
            `Hi ${name}, thanks for shopping with us. See you next time!`,
        },
        {
          id: "restock",
          label: "Restock nudge",
          body: (name) =>
            `Hi ${name}, your usual items are in stock again. Drop by whenever you’re ready.`,
        },
        {
          id: "credit",
          label: "Credit reminder",
          body: (name) =>
            `Hi ${name}, a gentle reminder on your open balance with us. Happy to help settle anytime.`,
        },
      ],
    },
  },
  fnb: {
    id: "fnb",
    label: "Food & Beverage",
    ...nounForms("item", "items"),
    variantOptionLabel: "Portion / size",
    labels: {
      ...nounForms("item", "items").labels,
      posEmptyHint: "Search or tap a menu item to add",
      posBarcodeOff: "Barcodes off — search or tap a menu item to add",
      transferHelp:
        "Central store holds bulk. Send stock to a counter, then that counter sells its own stock.",
      barcodeHelpOn: "Barcode SKUs when useful (bottled drinks, packaged snacks).",
      barcodeHelpOff: "Skip barcodes. Tap menu items to sell.",
      inventoryUpdateTitle: "Update stock — select item + quantity",
      godownHelp:
        "Central store holds bulk. Send stock to a counter, then that counter sells its own stock.",
    },
    addProduct: {
      step1Hint: "Menu name & type — under 30 seconds",
      step2Title: "Portion / size",
      step2Hint: "Optional — skip if one size",
      intro: "Name + type is enough. Brand defaults to House if you leave it blank.",
      nameLabel: "Menu / item name",
      namePlaceholder: "e.g. Masala Chai / Cold Coffee",
      brandLabel: "Brand (or House)",
      brandPlaceholder: "e.g. House, Paper Boat, Coca-Cola",
      defaultBrand: "House",
      brandRequired: false,
      categoryLabel: "Type",
      categoryPlaceholder: "e.g. Hot drinks, Snacks, Meals…",
      categorySuggestions: FNB_CATEGORIES,
      productCodeLabel: "Kitchen / POS code",
      productCodePlaceholder: "Short code on tickets",
      brandCodeLabel: "Supplier code",
      brandCodePlaceholder: "For bottled / packaged only",
      aliasLabel: "Short POS name",
      aliasPlaceholder: "e.g. Chai R",
      notesLabel: "Notes",
      notesPlaceholder: "Recipe tip, allergens, prep time…",
      singleSkuLabel: "One size only — skip this",
      singleSkuValue: "Regular",
      defaultSizeFormat: "PORTION",
      sizeFormats: [
        { id: "PORTION", label: "Portion / cup", presets: FNB_PORTIONS },
        { id: "CUSTOM_MARKING", label: "Custom option", presets: [] },
      ],
    },
    crm: {
      showVehicles: false,
      layoutBlurb:
        "CRM for your outlet — guests with a phone land here for WhatsApp and loyalty follow-up.",
      gstSegmentLabel: "Corporate / GSTIN",
      gstSegmentHint: "Accounts with a GSTIN on file",
      whatsappTemplates: [
        {
          id: "thanks",
          label: "Thanks for visiting",
          body: (name) =>
            `Hi ${name}, thanks for visiting us. We’d love to see you again soon!`,
        },
        {
          id: "promo",
          label: "Today’s special",
          body: (name) =>
            `Hi ${name}, today’s special is ready — ask at the counter when you stop by.`,
        },
        {
          id: "credit",
          label: "Credit reminder",
          body: (name) =>
            `Hi ${name}, a gentle reminder on your open balance with us. Happy to help settle anytime.`,
        },
      ],
    },
  },
  general: {
    id: "general",
    label: "General retail",
    ...nounForms("product", "products"),
    variantOptionLabel: "Variant / option",
    labels: {
      ...nounForms("product", "products").labels,
      posEmptyHint: "Search or tap a product to add",
      posBarcodeOff: "Barcodes off — search or tap a product to add",
      transferHelp:
        "Warehouse holds bulk. Transfer to a shop, then that shop sells its own stock.",
      barcodeHelpOn: "Products can get barcodes. Scan at POS when you print labels.",
      barcodeHelpOff: "Skip barcodes. Find products by name/search and tap to sell.",
      inventoryUpdateTitle: "Update stock — select product + quantity",
      godownHelp:
        "Warehouse holds bulk. Transfer to a shop, then that shop sells its own stock.",
    },
    addProduct: {
      step1Hint: "Name & type — brand optional",
      step2Title: "Variants",
      step2Hint: "Optional — skip if one option",
      intro: "Tap a type, type the name, continue. Extras are optional.",
      nameLabel: "Product name",
      namePlaceholder: "e.g. Cotton Tee Navy / Widget Pro",
      brandLabel: "Brand",
      brandPlaceholder: "e.g. Brand or maker",
      defaultBrand: "Generic",
      brandRequired: false,
      categoryLabel: "Type",
      categoryPlaceholder: "e.g. Apparel, Home, Grocery…",
      categorySuggestions: GENERAL_CATEGORIES,
      productCodeLabel: "Your item code",
      productCodePlaceholder: "Shelf / SKU label",
      brandCodeLabel: "Supplier code",
      brandCodePlaceholder: "From catalog or invoice",
      aliasLabel: "Short POS name",
      aliasPlaceholder: "e.g. Tee Navy M",
      notesLabel: "Notes",
      notesPlaceholder: "Color, material, warranty…",
      singleSkuLabel: "One option only — skip this",
      singleSkuValue: "One size",
      defaultSizeFormat: "SIZE",
      sizeFormats: [
        { id: "SIZE", label: "Size / option", presets: GENERAL_SIZES },
        { id: "CUSTOM_MARKING", label: "Custom option", presets: [] },
      ],
    },
    crm: {
      showVehicles: false,
      layoutBlurb:
        "CRM for your shop — every invoice with a phone lands here for WhatsApp and credit follow-up.",
      gstSegmentLabel: "B2B / GSTIN",
      gstSegmentHint: "Buyers with a GSTIN on file",
      whatsappTemplates: [
        {
          id: "thanks",
          label: "Thanks for shopping",
          body: (name) =>
            `Hi ${name}, thanks for shopping with us. See you again soon!`,
        },
        {
          id: "followup",
          label: "Follow-up",
          body: (name) =>
            `Hi ${name}, just checking in — let us know if you need anything else.`,
        },
        {
          id: "credit",
          label: "Credit reminder",
          body: (name) =>
            `Hi ${name}, a gentle reminder on your open balance with us. Happy to help settle anytime.`,
        },
      ],
    },
  },
};

export function normalizeIndustryId(value: unknown): IndustryId {
  if (
    value === "auto_tyre" ||
    value === "fmcg" ||
    value === "fnb" ||
    value === "general"
  ) {
    return value;
  }
  return "auto_tyre";
}

export function getIndustryProfile(id?: IndustryId | string | null): IndustryProfile {
  return PROFILES[normalizeIndustryId(id)];
}
