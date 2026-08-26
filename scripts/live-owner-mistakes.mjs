/**
 * LIVE owner-mistakes walk — sit at the counter and do dumb / rushed things
 * a real shop owner would do. App must catch them without silent data damage.
 *
 * Prerequisites: API :8000 and web :3000 already running.
 *
 *   node scripts/live-owner-mistakes.mjs
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
const OUT = path.join(__dirname, "live-mistakes-evidence");
const WEB = process.env.WEB_URL || "http://127.0.0.1:3000";
const PASS = "SecurePass1!";
const PRODUCT = "Mistake Walk Parle Live";

fs.mkdirSync(OUT, { recursive: true });

const findings = [];
const notes = [];

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  findings.push(line);
}

function ok(pin, msg) {
  log(`OK [${pin}] ${msg}`);
}

function brk(pin, msg) {
  const m = `BREAK [${pin}] ${msg}`;
  log(m);
  notes.push(m);
}

function warn(pin, msg) {
  const m = `WARN [${pin}] ${msg}`;
  log(m);
  notes.push(m);
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
  log(`SHOT ${name}.png`);
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function signupFill(page, { name, email, password, confirm, industry }) {
  await page.goto(`${WEB}/signup`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.getByPlaceholder("Your name").fill(name);
  await page.locator("select").first().selectOption(industry);
  await page.getByPlaceholder(/you@company|shop@gmail/i).fill(email);
  await page.getByPlaceholder("At least 8 characters").fill(password);
  await page.getByPlaceholder("Repeat password").fill(confirm);
}

async function expectStillOnSignup(page, pin) {
  await page.waitForTimeout(800);
  const url = page.url();
  if (/\/signup/i.test(url)) ok(pin, "stayed on signup (rejected)");
  else brk(pin, `should stay on signup, got ${url}`);
}

async function bootstrapOwner(page) {
  const stamp = Date.now().toString(36).slice(-5);
  const email = `mistakes.${stamp}@counter.test`;

  await signupFill(page, {
    name: "Mistake Desk Kirana",
    email,
    password: PASS,
    confirm: PASS,
    industry: "fmcg",
  });
  await page.getByRole("button", { name: /create account|sign up/i }).click();
  await page.waitForURL(/\/admin\/settings/, { timeout: 30000 });
  ok("BOOT", `owner ready ${email}`);

  // GST off — typical kirana mistake-path we care about
  await page.getByRole("button", { name: /GST off/i }).first().click();
  await page.waitForTimeout(900);

  // Create shop
  await page.goto(`${WEB}/admin/warehouses`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Add|Create/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder(/Front counter|Main shop|Bangalore/i).fill("Front Counter");
  await page
    .getByPlaceholder(/Full shop|godown address|Full warehouse address/i)
    .fill("12 Market Road, City Center, PIN 500001");
  await page.getByRole("button", { name: /Save shop|Create /i }).click();
  await page.waitForTimeout(1500);

  return email;
}

async function openAddProduct(page) {
  await page.goto(`${WEB}/admin/inventory`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Add a product/i }).first().click();
  await page.locator('input[name="name"]').waitFor({ state: "visible", timeout: 10000 });
}

async function skipToPrices(page) {
  await page.getByRole("button", { name: /^Continue$/i }).click();
  await page.waitForTimeout(400);
  const skip = page.getByRole("button", {
    name: /One (pack size|size|SKU|option)/i,
  });
  if (await skip.count()) await skip.first().click();
  else await page.getByRole("button", { name: /^Continue$/i }).click();
  await page.locator('input[name="costPrice"]').waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function main() {
  log(`Owner-mistakes live walk → ${WEB}`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ─── AUTH MISTAKES ─────────────────────────────────────────────
    log("═══ AUTH mistakes ═══");

    // M1: password mismatch
    await signupFill(page, {
      name: "Rushed Owner",
      email: `mismatch.${Date.now().toString(36)}@counter.test`,
      password: PASS,
      confirm: "DifferentPass1!",
      industry: "fmcg",
    });
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await shot(page, "m1-password-mismatch");
    const m1 = await bodyText(page);
    if (/do not match|don't match|mismatch/i.test(m1)) ok("M1", "password mismatch caught");
    else brk("M1", "no password-mismatch message");
    await expectStillOnSignup(page, "M1");

    // M2: empty email smash submit
    await signupFill(page, {
      name: "No Email",
      email: " ",
      password: PASS,
      confirm: PASS,
      industry: "fmcg",
    });
    await page.getByPlaceholder("you@company.com").fill("");
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await shot(page, "m2-empty-email");
    await page.waitForTimeout(600);
    const m2 = await bodyText(page);
    if (/email is required|required/i.test(m2) || /\/signup/i.test(page.url())) {
      ok("M2", "empty email blocked");
    } else brk("M2", "empty email may have slipped through");

    // Bootstrap a real owner for the rest
    const email = await bootstrapOwner(page);
    await shot(page, "boot-ready");

    // M3: duplicate email signup
    await page.goto(`${WEB}/signup`, { waitUntil: "networkidle" });
    await signupFill(page, {
      name: "Clone Owner",
      email,
      password: PASS,
      confirm: PASS,
      industry: "fnb",
    });
    await page.getByRole("button", { name: /create account|sign up/i }).click();
    await page.waitForTimeout(1500);
    await shot(page, "m3-duplicate-email");
    const m3 = await bodyText(page);
    if (/already exists|sign in/i.test(m3)) ok("M3", "duplicate email blocked");
    else if (/\/admin\/settings/i.test(page.url())) brk("M3", "duplicate email created a second account");
    else warn("M3", `unclear duplicate handling: ${m3.slice(0, 120)}`);

    // Session may still be the original owner — go straight back to admin work
    await page.goto(`${WEB}/admin/warehouses`, { waitUntil: "networkidle" });
    if (!/\/admin/i.test(page.url())) {
      await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(PASS);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/admin/, { timeout: 30000 });
    }
    ok("BOOT", "back in admin after dup attempt");

    // ─── WAREHOUSE MISTAKES ────────────────────────────────────────
    log("═══ STORAGE mistakes ═══");
    await page.goto(`${WEB}/admin/warehouses`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Add|Create/i }).first().click();
    await page.waitForTimeout(400);

    // M4: empty name
    await page.getByRole("button", { name: /Create Warehouse/i }).click();
    await page.waitForTimeout(700);
    await shot(page, "m4-empty-warehouse-name");
    const m4 = await bodyText(page);
    if (/name is required|Shop name|required/i.test(m4)) ok("M4", "empty warehouse name blocked");
    else brk("M4", "empty warehouse name not clearly blocked");

    // M5: short address
    await page.getByPlaceholder(/Bangalore Main Warehouse/i).fill("Back Godown");
    await page.getByPlaceholder(/Full warehouse address/i).fill("x");
    await page.getByRole("button", { name: /Create Warehouse/i }).click();
    await page.waitForTimeout(700);
    await shot(page, "m5-short-address");
    const m5 = await bodyText(page);
    if (/Address is required|at least/i.test(m5)) ok("M5", "short address blocked");
    else brk("M5", "short warehouse address not blocked");

    await page.keyboard.press("Escape");

    // ─── ADD-PRODUCT MISTAKES ──────────────────────────────────────
    log("═══ ADD PRODUCT mistakes ═══");

    // M6: smash Continue with empty essentials
    await openAddProduct(page);
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(500);
    await shot(page, "m6-empty-essentials");
    const m6 = await bodyText(page);
    const m6name = /Please enter the product name/i.test(m6);
    const m6cat = /Tap a type below/i.test(m6);
    if (m6name && m6cat) ok("M6", "empty name+type blocked with clear copy");
    else brk("M6", `missing validation copy (name=${m6name} type=${m6cat})`);

    // M7: name only, no type
    await page.locator('input[name="name"]').fill(PRODUCT);
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "m7-no-type");
    const m7 = await bodyText(page);
    if (/Tap a type below/i.test(m7) && (await page.locator('input[name="name"]').isVisible())) {
      ok("M7", "type required even when name filled");
    } else brk("M7", "advanced without type");

    // Fill properly through step 2
    await page.getByRole("button", { name: "Biscuits", exact: true }).click();
    await skipToPrices(page);

    // M8: GST off → tax field must stay hidden
    if (await page.locator('select[name="gstPercentage"]').count()) {
      brk("M8", "GST field visible while GST is off");
    } else ok("M8", "GST field hidden with GST off");
    await shot(page, "m8-gst-hidden");

    // M9: sale > MRP
    await page.locator('input[name="costPrice"]').fill("40");
    await page.locator('input[name="mrp"]').fill("50");
    await page.locator('input[name="sellingPrice"]').fill("99");
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(500);
    await shot(page, "m9-sale-over-mrp");
    const m9 = await bodyText(page);
    if (/cannot be higher than the maximum tag price|MRP/i.test(m9)) {
      ok("M9", "sale > MRP blocked");
    } else if (await page.locator('input[name="initialStock"]').isVisible().catch(() => false)) {
      brk("M9", "advanced to stock with sale > MRP");
    } else brk("M9", "no clear sale>MRP message");

    // M10: zero / blank cost
    await page.locator('input[name="costPrice"]').fill("0");
    await page.locator('input[name="mrp"]').fill("60");
    await page.locator('input[name="sellingPrice"]').fill("55");
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "m10-zero-cost");
    const m10 = await bodyText(page);
    if (/must be more than zero/i.test(m10)) ok("M10", "zero cost blocked");
    else brk("M10", "zero cost not blocked");

    // Fix prices and go to stock
    await page.locator('input[name="costPrice"]').fill("40");
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.locator('input[name="initialStock"]').waitFor({
      state: "visible",
      timeout: 10000,
    });

    // M11: qty entered but warehouse cleared
    await page.locator('input[name="initialStock"]').fill("25");
    const wh = page.locator('select[name="warehouseId"]');
    // clear selection if possible
    const hasEmpty = await wh.locator('option[value=""]').count();
    if (hasEmpty) {
      await wh.selectOption("");
      await page.getByRole("button", { name: /^Continue$/i }).click();
      await page.waitForTimeout(400);
      await shot(page, "m11-stock-no-place");
      const m11 = await bodyText(page);
      if (/pick where those units are stored|quantity/i.test(m11)) {
        ok("M11", "stock qty without place blocked");
      } else brk("M11", "stock without warehouse not blocked");
    } else {
      warn("M11", "no empty warehouse option to clear — skipped");
    }

    // Save the product (name already PRODUCT) for POS mistakes
    const vals = await wh.locator("option").evaluateAll((opts) =>
      opts.map((o) => o.value).filter(Boolean),
    );
    if (vals.length) await wh.selectOption(vals[0]);
    await page.locator('input[name="initialStock"]').fill("25");
    await page.getByRole("button", { name: /^Continue$/i }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Save product/i }).click();
    await page.waitForTimeout(2500);
    await shot(page, "boot-product-saved");
    const saved = await bodyText(page);
    if (/Could not save|failed/i.test(saved)) brk("BOOT-P", "product save failed");
    else ok("BOOT-P", "product saved for POS mistakes");
    const done = page.getByRole("button", { name: /^Done$/i });
    if (await done.count()) await done.click();

    // M12: cancel mid-flow then reopen — form should be clean
    await openAddProduct(page);
    await page.locator('input[name="name"]').fill("Should Not Stick");
    await page.getByRole("button", { name: /^Cancel$/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Add a product/i }).first().click();
    await page.locator('input[name="name"]').waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    const leftover = await page.locator('input[name="name"]').inputValue();
    await shot(page, "m12-cancel-reopen");
    if (leftover === "" || leftover !== "Should Not Stick") {
      ok("M12", "cancel clears draft on reopen");
    } else brk("M12", "draft name leaked after cancel/reopen");
    await page.keyboard.press("Escape");

    // ─── POS MISTAKES ──────────────────────────────────────────────
    log("═══ POS mistakes ═══");
    await page.goto(`${WEB}/pos`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await shot(page, "pos-open");

    // M13: empty cart checkout must be disabled
    const checkoutBtn = page.getByRole("button", {
      name: /Proceed to Checkout/i,
    });
    if (await checkoutBtn.count()) {
      const disabled = await checkoutBtn.isDisabled();
      const hint = await bodyText(page);
      if (disabled) {
        ok("M13", "empty-cart checkout disabled");
        if (/Add a product to the cart first/i.test(hint)) {
          ok("M13b", "empty-cart hint shown");
        }
      } else {
        brk("M13", "empty cart can open checkout");
      }
    } else warn("M13", "checkout button not found");

    // Add product — click the product card's main button
    const addBtn = page
      .locator("button")
      .filter({ hasText: PRODUCT })
      .filter({ hasText: /Selling|₹/ })
      .first();
    if (await addBtn.count()) {
      await addBtn.click();
    } else {
      await page
        .locator("button")
        .filter({ hasText: new RegExp(PRODUCT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
        .first()
        .click();
    }
    await page.waitForTimeout(900);
    // size modal?
    const addToCart = page.getByRole("button", { name: /Add to (cart|bill)/i });
    if (await addToCart.count()) {
      await addToCart.first().click();
      await page.waitForTimeout(500);
    }
    await shot(page, "pos-item-added");

    let cartText = await bodyText(page);
    if (!/\b1 item\b|₹55/i.test(cartText) || /Cart is empty/i.test(cartText)) {
      // Fallback: barcode / search path via pos store search results
      const search = page.getByPlaceholder(/Search products/i);
      await search.fill(PRODUCT);
      await page.waitForTimeout(1200);
      await shot(page, "pos-search-results");
      const suggestion = page
        .locator("button, [role='option'], li")
        .filter({ hasText: PRODUCT })
        .first();
      if (await suggestion.count()) {
        await suggestion.click();
        await page.waitForTimeout(700);
      } else {
        // Enter to take first hit if search bar supports it
        await search.press("Enter");
        await page.waitForTimeout(700);
      }
      cartText = await bodyText(page);
    }
    await shot(page, "pos-item-added-2");

    if (/Cart is empty/i.test(cartText) && !/\b1 item\b/i.test(cartText)) {
      brk("POS", "could not add product to cart from grid or search");
    } else {
      ok("POS", "product in cart");
    }

    // M14: GST off → no Calculate GST checkbox
    if (await checkoutBtn.isDisabled()) {
      brk("POS", "checkout still disabled after adding item");
    } else {
      await checkoutBtn.click();
      await page.waitForTimeout(800);
      await shot(page, "m14-checkout-gst");
      const cbody = await bodyText(page);
      if (/Calculate GST on invoice/i.test(cbody)) {
        brk("M14", "GST checkbox shown while business GST is off");
      } else ok("M14", "no GST ask at billing with GST off");

      // Walk checkout: review → customer mistakes → skip → payment
      // Step 1 review
      const cont1 = page.getByRole("button", {
        name: /^(Continue|Proceed to Payment)$/i,
      });
      if (await cont1.count()) {
        await cont1.first().click();
        await page.waitForTimeout(600);
      }

      // M14c: smash Continue to Payment without mobile
      if (await page.getByText(/Mobile/i).count()) {
        const toPay = page.getByRole("button", {
          name: /Continue to Payment/i,
        });
        if (await toPay.count()) {
          await toPay.click();
          await page.waitForTimeout(500);
          await shot(page, "m14c-no-mobile");
          const custBody = await bodyText(page);
          if (/Mobile number is required/i.test(custBody)) {
            ok("M14c", "checkout without mobile blocked");
          } else {
            brk("M14c", "continued to payment without required mobile");
          }
        }
        // Skip customer like a rushed cashier
        const skip = page.getByRole("button", { name: /^Skip$/i });
        if (await skip.count()) {
          await skip.first().click();
          await page.waitForTimeout(600);
          ok("M14d", "Skip customer reached payment");
        }
      }

      // M15: underpay — Cash+ auto-fills full due; then edit amount down to ₹1
      await shot(page, "m15-payment-step");
      const cash = page.getByRole("button", { name: /Cash/i }).first();
      if (await cash.count()) {
        await cash.click();
        await page.waitForTimeout(500);
      }
      const amountInput = page.locator('input[type="number"]').first();
      await amountInput.waitFor({ state: "visible", timeout: 8000 });
      await amountInput.fill("");
      await amountInput.fill("1");
      await page.waitForTimeout(500);

      const complete = page.getByRole("button", { name: /Complete Sale/i });
      const payBody = await bodyText(page);
      const remMatch = payBody.match(/Remaining\s*\n?\s*₹\s*([\d.]+)/i);
      const rem = remMatch ? parseFloat(remMatch[1]) : NaN;
      const amtVal = await amountInput.inputValue();
      await shot(page, "m15-underpay");

      if (!(await complete.count())) {
        warn("M15", "Complete Sale button missing");
      } else if ((await complete.isDisabled()) && rem > 0) {
        ok("M15", `underpay blocks Complete Sale (remaining ₹${rem}, amount=${amtVal})`);
      } else if (!(await complete.isDisabled()) && rem > 0) {
        brk("M15", `Complete Sale enabled with remaining ₹${rem}`);
      } else if (!(await complete.isDisabled()) && rem === 0) {
        // React controlled input may ignore fill — force via keyboard
        await amountInput.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
        await page.keyboard.type("1");
        await page.waitForTimeout(600);
        await shot(page, "m15-underpay-retry");
        const payBody2 = await bodyText(page);
        const rem2 = parseFloat(
          (payBody2.match(/Remaining\s*\n?\s*₹\s*([\d.]+)/i) || [])[1] || "NaN",
        );
        if ((await complete.isDisabled()) && rem2 > 0) {
          ok("M15", `underpay blocks Complete Sale after retype (₹${rem2})`);
        } else if (!(await complete.isDisabled()) && rem2 > 0) {
          brk("M15", `Complete Sale enabled with remaining ₹${rem2}`);
        } else {
          warn(
            "M15",
            `could not force underpay (remaining=${rem2}, amount=${await amountInput.inputValue()})`,
          );
        }
      } else {
        warn("M15", `ambiguous underpay state remaining=${rem} amount=${amtVal}`);
      }

      // M16: full pay via Full
      const fullBtn = page.getByRole("button", { name: /^Full$/i });
      if (await fullBtn.count()) {
        await fullBtn.first().click();
        await page.waitForTimeout(400);
      } else {
        await amountInput.fill("55");
        await page.waitForTimeout(400);
      }

      if (await complete.count()) {
        if (!(await complete.isDisabled())) {
          await complete.click();
          await page.waitForTimeout(2500);
          await shot(page, "m16-sale-done");
          const doneBody = await bodyText(page);
          if (
            /success|complete|invoice|sale|Thank/i.test(doneBody) &&
            !/Checkout Failed/i.test(doneBody)
          ) {
            ok("M16", "full-pay sale completed after underpay check");
          } else if (/Checkout Failed|error/i.test(doneBody)) {
            brk("M16", `sale failed: ${doneBody.slice(0, 160)}`);
          } else warn("M16", "unclear sale outcome");
        } else {
          warn("M16", "Complete Sale still disabled after Full");
          await shot(page, "m16-stuck");
        }
      } else {
        warn("M15", "never reached Complete Sale step");
        await shot(page, "m15-no-complete");
      }

      await page.keyboard.press("Escape");
    }

    // M17: wrong password login
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("WrongPass999!");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForTimeout(1200);
    await shot(page, "m17-wrong-password");
    if (/\/login/i.test(page.url()) || /invalid|incorrect|credentials|failed/i.test(await bodyText(page))) {
      ok("M17", "wrong password rejected");
    } else brk("M17", "wrong password may have logged in");
  } catch (err) {
    brk("FATAL", err.message);
    try {
      await shot(page, "FATAL");
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close();
  }

  const report = path.join(OUT, "REPORT.md");
  const breaks = notes.filter((n) => /BREAK/i.test(n));
  const warns = notes.filter((n) => /WARN/i.test(n));
  fs.writeFileSync(
    report,
    [
      `# Live owner mistakes`,
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
