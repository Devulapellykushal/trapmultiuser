/**
 * LIVE counter walk — drives the real Next.js + Django apps in Chromium.
 * Sit at each business type like an owner: signup → settings → storage → inventory.
 *
 * Prerequisites: API :8000 and web :3000 already running.
 *
 *   node scripts/live-counter-walk.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../apps/client/package.json",
  ),
);
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "live-counter-evidence");
const WEB = process.env.WEB_URL || "http://127.0.0.1:3000";
const PASS = "SecurePass1!";

const INDUSTRIES = [
  {
    id: "fmcg",
    label: "FMCG",
    shopName: "Priya Kirana Live",
    product: "Parle-G 800g Live",
    brand: "Parle",
    categoryChip: "Biscuits",
  },
  {
    id: "fnb",
    label: "Food & Beverage",
    shopName: "Arjun Cafe Live",
    product: "Masala Chai Live",
    brand: "House",
    categoryChip: "Hot drinks",
  },
  {
    id: "auto_tyre",
    label: "Auto / Tyre",
    shopName: "Kushal Tyres Live",
    product: "MRF ZLX Live",
    brand: "MRF",
    categoryChip: "Car radial",
  },
  {
    id: "general",
    label: "General retail",
    shopName: "General Mart Live",
    product: "Cotton Tee Live",
    brand: "Generic",
    categoryChip: "Apparel",
  },
];

fs.mkdirSync(OUT, { recursive: true });

const findings = [];

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  findings.push(line);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`SHOT ${name}.png`);
}

async function waitReady(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);
}

async function clickText(page, text, opts = {}) {
  const loc = page.getByText(text, { exact: opts.exact ?? false }).first();
  await loc.waitFor({ state: "visible", timeout: opts.timeout ?? 15000 });
  await loc.click();
}

async function walkIndustry(browser, industry) {
  const stamp = Date.now().toString(36).slice(-5);
  const email = `live.${industry.id}.${stamp}@counter.test`;
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();
  const tag = industry.id;
  const notes = [];

  try {
    log(`═══ COUNTER: ${industry.label} (${email}) ═══`);

    // 1) Signup
    await page.goto(`${WEB}/signup`, { waitUntil: "networkidle" });
    await waitReady(page);
    await page.getByPlaceholder("Your name").fill(industry.shopName);
    await page.locator("select").first().selectOption(industry.id);
    await page.getByPlaceholder(/you@company|shop@gmail/i).fill(email);
    await page.getByPlaceholder("At least 8 characters").fill(PASS);
    await page.getByPlaceholder("Repeat password").fill(PASS);
    await shot(page, `${tag}-01-signup`);
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await page.waitForURL(/\/admin\/settings/, { timeout: 30000 });
    log(`OK landed settings after signup`);
    await shot(page, `${tag}-02-settings-setup`);

    // 2) Settings — GST off (kirana-style), confirm prices hide GST later
    let expectGstField = false;
    const gstOff = page.getByRole("button", { name: /GST off/i }).first();
    if (await gstOff.count()) {
      await gstOff.click();
      await page.waitForTimeout(1000);
      const body = await page.locator("body").innerText();
      if (!/Now using:\s*GST off/i.test(body) && !/GST off/i.test(body)) {
        notes.push("WARN: GST off click may not have stuck");
      } else {
        log("OK GST off selected");
      }
    } else {
      notes.push("BREAK: GST toggle not found on settings");
    }
    await shot(page, `${tag}-03-gst-off`);

    // Tyre / general: turn GST back on (workshop often charges tax)
    if (industry.id === "auto_tyre" || industry.id === "general") {
      const gstOn = page.getByRole("button", { name: /GST on/i }).first();
      if (await gstOn.count()) {
        await gstOn.click();
        await page.waitForTimeout(1000);
        expectGstField = true;
        log("OK GST on restored for this counter");
      } else {
        notes.push("WARN: could not click GST on");
      }
    }

    // 3) Inventory BEFORE warehouse → must say no storage
    await page.goto(`${WEB}/admin/inventory`, { waitUntil: "networkidle" });
    await waitReady(page);
    await shot(page, `${tag}-04-inventory-no-storage`);
    const invBody = await page.locator("body").innerText();
    if (/No .+ set up yet/i.test(invBody) || /Create (shop|godown)/i.test(invBody)) {
      log("OK inventory banner: no storage yet");
    } else {
      notes.push("BREAK: inventory missing 'no storage' banner before warehouse");
    }

    await page.getByRole("button", { name: /Add a product/i }).first().click();
    await page.waitForTimeout(600);
    await shot(page, `${tag}-05-add-product-gate`);
    const modalText = await page.locator("body").innerText();
    if (/No .+ set up yet/i.test(modalText) || /Create (shop|godown|storage)/i.test(modalText)) {
      log("OK add-product gate blocks empty storage");
    } else if (/Storage place/i.test(modalText) && /Not chosen|Choose where/i.test(modalText)) {
      notes.push("BREAK: add-product still shows empty storage dropdown instead of gate");
    } else {
      notes.push("WARN: could not confirm add-product storage gate");
    }
    // close modal if open
    const cancel = page.getByRole("button", { name: /^Cancel$/i });
    if (await cancel.count()) await cancel.first().click();
    await page.keyboard.press("Escape");

    // 4) Create warehouse / shop
    await page.goto(`${WEB}/admin/warehouses`, { waitUntil: "networkidle" });
    await waitReady(page);
    await page.getByRole("button", { name: /Add|Create/i }).first().click();
    await page.waitForTimeout(400);
    await page.getByPlaceholder(/Front counter|Main shop|Main /i).fill(`${industry.shopName} Shop`);
    await page.getByPlaceholder(/Full shop|godown address|Full warehouse address/i).fill("12 Market Road, City Center, PIN 500001");
    await shot(page, `${tag}-06-create-storage`);
    await page.getByRole("button", { name: /Save shop|Create /i }).click();
    await page.waitForTimeout(1500);
    log("OK storage create submitted");
    await shot(page, `${tag}-07-storage-list`);

    // 5) Inventory + add product for real
    await page.goto(`${WEB}/admin/inventory`, { waitUntil: "networkidle" });
    await waitReady(page);
    const inv2 = await page.locator("body").innerText();
    if (/No .+ set up yet/i.test(inv2) && !/products/i.test(inv2)) {
      notes.push("WARN: inventory still shows no-storage after warehouse create");
    }
    await page.getByRole("button", { name: /Add a product/i }).first().click();
    await page.waitForTimeout(700);
    await shot(page, `${tag}-08-add-product-step1`);

    // Essentials — use name= attrs (placeholders collide across fields)
    const nameInput = page.locator('input[name="name"]');
    await nameInput.waitFor({ state: "visible", timeout: 10000 });
    await nameInput.fill(industry.product);

    const chip = page.getByRole("button", {
      name: industry.categoryChip,
      exact: true,
    });
    if (await chip.count()) {
      await chip.click();
      log(`OK category chip ${industry.categoryChip}`);
    } else {
      await page.locator('input[name="category"]').fill(industry.categoryChip);
      log(`OK typed category ${industry.categoryChip}`);
    }

    const brand = page.locator('input[name="brand"]');
    if (await brand.count()) await brand.fill(industry.brand);

    // Confirm controlled inputs stuck
    const nameVal = await nameInput.inputValue();
    const catVal = await page.locator('input[name="category"]').inputValue();
    if (nameVal !== industry.product) {
      notes.push(`BREAK: name input stuck empty/wrong (got "${nameVal}")`);
    }
    if (!catVal) {
      notes.push("BREAK: category chip/type did not set category input");
    }

    // Check no tyre leakage on FMCG/F&B
    const stepBody = await page.locator("body").innerText();
    if (
      industry.id !== "auto_tyre" &&
      /Car radial|Alloy wheel|sidewall marking/i.test(stepBody)
    ) {
      notes.push("BREAK: tyre copy leaked into non-tyre add-product");
    } else {
      log("OK industry copy looks clean on step 1");
    }

    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(500);

    // Must leave step 1
    if (await page.locator('input[name="name"]').isVisible().catch(() => false)) {
      const still = await page.locator("body").innerText();
      if (/Please enter the product name|Tap a type below/i.test(still)) {
        notes.push("BREAK: stuck on step 1 after Continue (validation)");
        throw new Error("stuck on add-product step 1");
      }
    }

    // Step 2 skip single SKU if present
    const skip = page.getByRole("button", { name: /One (pack size|size|SKU|option)/i });
    if (await skip.count()) {
      await skip.first().click();
      log("OK skipped variants");
    } else {
      const cont2 = page.getByRole("button", { name: /^Continue$/i });
      if (await cont2.count()) await cont2.click();
    }
    await page.waitForTimeout(500);

    // Prices
    const cost = page.locator('input[name="costPrice"]');
    await cost.waitFor({ state: "visible", timeout: 15000 });
    await cost.fill("40");
    await page.locator('input[name="mrp"]').fill("60");
    await page.locator('input[name="sellingPrice"]').fill("55");
    const gstSelect = page.locator('select[name="gstPercentage"]');
    const gstVisible = (await gstSelect.count()) > 0;
    if (expectGstField && !gstVisible) {
      notes.push("BREAK: GST select missing while GST is on");
    } else if (!expectGstField && gstVisible) {
      notes.push("BREAK: GST select still shown while GST is off");
    } else if (expectGstField) {
      log("OK GST field visible (GST on)");
    } else {
      log("OK GST field hidden (GST off)");
    }
    await shot(page, `${tag}-09-prices`);
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(500);

    // Stock — storage should be selectable
    const stockBody = await page.locator("body").innerText();
    if (/No .+ set up yet/i.test(stockBody) && !/Choose where stock sits|Storage place/i.test(stockBody)) {
      notes.push("BREAK: stock step still has no storage after create");
    }
    const whSelect = page.locator('select[name="warehouseId"]');
    await whSelect.waitFor({ state: "visible", timeout: 10000 });
    const options = await whSelect.locator("option").count();
    if (options >= 1) {
      const vals = await whSelect.locator("option").evaluateAll((opts) =>
        opts.map((o) => o.value).filter(Boolean),
      );
      if (vals.length) {
        await whSelect.selectOption(vals[0]);
        log(`OK storage dropdown has ${vals.length} warehouse(s)`);
      } else {
        notes.push("BREAK: storage dropdown empty at stock step");
      }
    } else {
      notes.push("BREAK: storage dropdown empty at stock step");
    }
    await page.locator('input[name="initialStock"]').fill("10");
    await shot(page, `${tag}-10-stock`);
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(500);
    await shot(page, `${tag}-11-review`);
    await page.getByRole("button", { name: /Save product/i }).click();
    await page.waitForTimeout(2500);
    await shot(page, `${tag}-12-saved`);
    const after = await page.locator("body").innerText();
    if (/Could not save|failed/i.test(after)) {
      notes.push("BREAK: product save failed");
    } else if (/All set|Done|saved|Inventory/i.test(after)) {
      log("OK product save flow reached success/done");
    } else {
      notes.push("WARN: unclear product save outcome");
    }

    // close done
    const done = page.getByRole("button", { name: /^Done$/i });
    if (await done.count()) await done.click();

    await page.goto(`${WEB}/admin/inventory`, { waitUntil: "networkidle" });
    await waitReady(page);
    await shot(page, `${tag}-13-inventory-list`);
    const list = await page.locator("body").innerText();
    if (list.includes(industry.product)) log(`OK product visible in inventory: ${industry.product}`);
    else notes.push(`BREAK: product not listed: ${industry.product}`);
  } catch (err) {
    notes.push(`ERROR: ${err.message}`);
    try {
      await shot(page, `${tag}-ERROR`);
    } catch {
      /* ignore */
    }
  } finally {
    for (const n of notes) log(`${tag}: ${n}`);
    await ctx.close();
  }

  return notes;
}

async function main() {
  log(`Live walk against ${WEB}`);
  const browser = await chromium.launch({ headless: true });
  const allNotes = [];

  // Health
  try {
    const res = await fetch(`${WEB}/login`);
    log(`WEB /login → ${res.status}`);
  } catch (e) {
    log(`FATAL web not reachable: ${e.message}`);
    process.exit(1);
  }

  const only = process.env.LIVE_ONLY;
  const list = only
    ? INDUSTRIES.filter((i) => i.id === only)
    : INDUSTRIES;
  for (const industry of list) {
    const notes = await walkIndustry(browser, industry);
    allNotes.push(...notes.map((n) => `${industry.id}: ${n}`));
  }

  await browser.close();

  const report = path.join(OUT, "REPORT.md");
  const breaks = allNotes.filter((n) => /BREAK|ERROR/i.test(n));
  const warns = allNotes.filter((n) => /WARN/i.test(n));
  fs.writeFileSync(
    report,
    [
      `# Live counter walk`,
      ``,
      `Web: ${WEB}`,
      `When: ${new Date().toISOString()}`,
      ``,
      `## Breaks (${breaks.length})`,
      ...(breaks.length ? breaks.map((b) => `- ${b}`) : ["- none"]),
      ``,
      `## Warnings (${warns.length})`,
      ...(warns.length ? warns.map((w) => `- ${w}`) : ["- none"]),
      ``,
      `## Log`,
      ...findings.map((l) => `- ${l}`),
      ``,
    ].join("\n"),
  );
  log(`Report → ${report}`);
  log(`Breaks=${breaks.length} Warns=${warns.length}`);
  process.exit(breaks.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
