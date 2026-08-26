"""
Professional-grade owner journey + adversarial security suite (API only).

Audience: senior full-stack, security, and business QA.
Contract: do NOT mutate application code from these tests — only probe and assert.

Coverage map (pin IDs used in assertions / failure messages):
  AUTH-*     register / login / refresh / me / weak password / duplicate
  SETUP-*    business-setup settings
  WH-*       warehouses
  INV-*      products / stock / POS catalog
  CRM-*      customers upsert / lookup / segments / summary / IDOR
  POS-*      checkout / idempotency / oversell / foreign warehouse
  SALE-*     sales list / detail isolation
  INVCE-*    invoices
  RPT-*      sales / inventory / profit / GST reports
  BIZ-*      multi-business create / switch / leave / last-admin
  RBAC-*     STAFF privilege boundaries
  TENANT-*   cross-org UUID guessing (IDOR)
  RET-*      returns create / list scoping
  SESS-*     re-login preserves active org

Known production defects these pins catch (should be green after tenancy/payment fixes):
  TENANT-RETURN-IDOR / TENANT-RETURNS-DETAIL-ISO / RET-LIST-ROUTE
  TENANT-STOCK-ADJUST-IDOR / TENANT-STOCK-ADJUST-WH-IDOR
  POS-UNDERPAY

Run:
  python manage.py test users.tests_owner_journeys --keepdb -v2
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from django.test import TestCase, override_settings
from django.urls import Resolver404, resolve
from rest_framework.test import APIClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _results(payload: Any) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if "results" in payload and isinstance(payload["results"], list):
            return payload["results"]
        return []
    return []


def _uid(prefix: str = "j") -> str:
    return f"{prefix}.{uuid.uuid4().hex[:10]}@journey.test"


def _date_window(days: int = 30) -> tuple[str, str]:
    today = date.today()
    return (today - timedelta(days=days)).isoformat(), today.isoformat()


class PinFailure(AssertionError):
    """Assertion with a stable pin id for audit reports."""


def pin(pin_id: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise PinFailure(f"[{pin_id}] {detail}")


def pin_status(pin_id: str, response, expected: int | tuple[int, ...], detail: str = "") -> None:
    if isinstance(expected, int):
        expected = (expected,)
    if response.status_code not in expected:
        body = getattr(response, "data", None)
        raise PinFailure(
            f"[{pin_id}] expected status {expected}, got {response.status_code}. "
            f"{detail} body={body}"
        )


class OwnerSession:
    """Authenticated API actor for one business owner / staff login."""

    def __init__(self, email: str | None = None, password: str = "SecurePass1!", name: str = ""):
        self.email = email or _uid("owner")
        self.password = password
        self.name = name or self.email.split("@")[0].replace(".", " ").title()
        self.client = APIClient()
        self.access: str | None = None
        self.refresh: str | None = None
        self.user: dict | None = None

    def auth_header(self) -> None:
        if self.access:
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")

    def clear_auth(self) -> None:
        self.client.credentials()
        self.access = None
        self.refresh = None

    def _apply_tokens(self, data: dict) -> dict:
        self.access = data["access"]
        self.refresh = data.get("refresh")
        self.user = data.get("user")
        self.auth_header()
        return data

    def register(self, industry: str, *, expect: int = 201) -> Any:
        res = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": self.email,
                "password": self.password,
                "name": self.name,
                "industry": industry,
            },
            format="json",
        )
        if expect == 201 and res.status_code == 201:
            self._apply_tokens(res.data)
        return res

    def login(self, *, expect: int = 200) -> Any:
        res = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.email, "password": self.password},
            format="json",
        )
        if expect == 200 and res.status_code == 200:
            self._apply_tokens(res.data)
        return res

    def me(self) -> Any:
        return self.client.get("/api/v1/auth/me/")

    def org_id(self) -> str:
        me = self.me()
        pin_status("AUTH-ME", me, 200)
        self.user = me.data
        return str(me.data.get("organizationId"))

    def patch_setup(self, **kwargs) -> Any:
        return self.client.patch(
            "/api/v1/invoices/settings/business-setup/",
            kwargs,
            format="json",
        )

    def create_warehouse(self, name: str, code: str) -> Any:
        return self.client.post(
            "/api/v1/inventory/warehouses/",
            {
                "name": name,
                "code": code,
                "address": "12 Market Road, City Center, PIN 500001",
            },
            format="json",
        )

    def create_product(
        self,
        *,
        name: str,
        brand: str,
        category: str,
        warehouse_id: str,
        cost: str,
        sell: str,
        stock: int,
        size: str = "",
    ) -> dict:
        payload = {
            "name": name,
            "brand": brand,
            "category": category,
            "warehouse_id": warehouse_id,
            "pricing": {
                "cost_price": cost,
                "mrp": sell,
                "selling_price": sell,
                "gst_percentage": "18.00",
            },
            "variants": [
                {
                    "size": size,
                    "cost_price": cost,
                    "selling_price": sell,
                    "initial_stock": stock,
                    "reorder_threshold": 5,
                }
            ],
        }
        res = self.client.post("/api/v1/inventory/products/", payload, format="json")
        pin_status("INV-CREATE", res, 201, f"product={name}")
        body = res.data if isinstance(res.data, dict) else {}
        pid = body.get("id")
        barcode = body.get("barcodeValue") or body.get("barcode_value") or ""
        variant_id = None
        variants = body.get("variants") or []
        if variants:
            variant_id = variants[0].get("id")

        if not pid:
            listed = self.client.get("/api/v1/inventory/products/", {"search": name})
            pin_status("INV-RESOLVE-LIST", listed, 200)
            match = next((p for p in _results(listed.data) if p.get("name") == name), None)
            pin("INV-RESOLVE-MATCH", match is not None, f"created product not listed: {name}")
            pid = match.get("id")
            barcode = match.get("barcodeValue") or match.get("barcode_value") or barcode
            variants = match.get("variants") or []
            if variants:
                variant_id = variants[0].get("id")

        # Prefer detail for variant + barcode completeness
        detail = self.client.get(f"/api/v1/inventory/products/{pid}/")
        if detail.status_code == 200 and isinstance(detail.data, dict):
            barcode = (
                detail.data.get("barcodeValue")
                or detail.data.get("barcode_value")
                or barcode
            )
            variants = detail.data.get("variants") or variants
            if variants and not variant_id:
                variant_id = variants[0].get("id")

        pin("INV-HAS-ID", bool(pid), f"product id missing for {name}")
        return {
            "id": str(pid),
            "name": name,
            "barcodeValue": barcode or "",
            "variant_id": str(variant_id) if variant_id else None,
            "sell": sell,
            "raw": body,
        }

    def upsert_customer(self, **kwargs) -> Any:
        return self.client.post("/api/v1/customers/upsert/", kwargs, format="json")

    def checkout(
        self,
        *,
        warehouse_id: str,
        amount: str,
        product_id: str | None = None,
        barcode: str = "",
        qty: int = 1,
        customer_name: str = "",
        customer_mobile: str = "",
        customer_email: str = "",
        customer_id: str | None = None,
        idempotency_key: str | None = None,
        expect_success: bool = True,
    ) -> Any:
        item: dict[str, Any] = {"quantity": qty}
        if barcode:
            item["barcode"] = barcode
        if product_id:
            item["product_id"] = product_id
        payload: dict[str, Any] = {
            "idempotency_key": idempotency_key or str(uuid.uuid4()),
            "warehouse_id": warehouse_id,
            "items": [item],
            "payments": [{"method": "CASH", "amount": amount}],
            "customer_name": customer_name,
            "customer_mobile": customer_mobile,
            "customer_email": customer_email,
            "apply_automatic_gst": False,
        }
        if customer_id:
            payload["customer_id"] = customer_id
        res = self.client.post("/api/v1/sales/checkout/", payload, format="json")
        if expect_success:
            pin_status("POS-CHECKOUT", res, (200, 201))
            pin("POS-SUCCESS", res.data.get("success") is True, str(res.data))
        return res

    def bootstrap_shop(
        self,
        industry: str,
        *,
        wh_name: str,
        wh_code: str,
        product_name: str,
        brand: str,
        category: str,
        cost: str,
        sell: str,
        stock: int,
        size: str = "",
        setup: dict | None = None,
    ) -> dict:
        reg = self.register(industry)
        pin_status("AUTH-REGISTER", reg, 201)
        setup_payload = setup or {
            "inventory_location_mode": "SINGLE_SHOP",
            "barcode_enabled": True,
        }
        setup_res = self.patch_setup(**setup_payload)
        pin_status("SETUP-PATCH", setup_res, 200)
        wh = self.create_warehouse(wh_name, wh_code)
        pin_status("WH-CREATE", wh, 201)
        product = self.create_product(
            name=product_name,
            brand=brand,
            category=category,
            warehouse_id=str(wh.data["id"]),
            cost=cost,
            sell=sell,
            stock=stock,
            size=size,
        )
        return {
            "org_id": self.org_id(),
            "warehouse": wh.data,
            "warehouse_id": str(wh.data["id"]),
            "product": product,
        }


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class AuthGateTests(TestCase):
    """AUTH-* — gatekeeping, validation, unauthenticated access."""

    def test_unauthenticated_me_and_businesses_rejected(self):
        client = APIClient()
        pin_status("AUTH-ME-401", client.get("/api/v1/auth/me/"), 401)
        pin_status("AUTH-BIZ-401", client.get("/api/v1/auth/businesses/"), 401)
        pin_status(
            "AUTH-WH-401",
            client.get("/api/v1/inventory/warehouses/"),
            401,
        )

    def test_register_rejects_weak_password_and_duplicate_email(self):
        owner = OwnerSession(email=_uid("weak"), password="short")
        res = owner.register("auto_tyre", expect=400)
        pin_status("AUTH-WEAK-PW", res, 400)

        owner2 = OwnerSession(email=_uid("dup"), password="SecurePass1!")
        pin_status("AUTH-REG-OK", owner2.register("general"), 201)
        dup = OwnerSession(email=owner2.email, password="SecurePass1!")
        pin_status("AUTH-DUP-EMAIL", dup.register("general", expect=400), 400)

    def test_register_rejects_invalid_industry_choice(self):
        owner = OwnerSession(email=_uid("badind"))
        res = owner.register("not_a_real_industry", expect=400)
        pin_status("AUTH-BAD-INDUSTRY", res, 400)

    def test_login_rejects_bad_credentials(self):
        owner = OwnerSession(email=_uid("badlogin"))
        pin_status("AUTH-REG-OK", owner.register("fmcg"), 201)
        bad = APIClient().post(
            "/api/v1/auth/login/",
            {"email": owner.email, "password": "WrongPass999!"},
            format="json",
        )
        pin_status("AUTH-BAD-LOGIN", bad, 400)

    def test_refresh_rejects_garbage_token(self):
        res = APIClient().post(
            "/api/v1/auth/refresh/",
            {"refresh": "not.a.valid.token"},
            format="json",
        )
        pin_status("AUTH-REFRESH-401", res, 401)


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class TyreOwnerFullBusinessDayTests(TestCase):
    """Happy-path: tyre owner end-to-end shop day (AUTH→SETUP→INV→CRM→POS→RPT)."""

    def test_01_full_shop_day_every_pin(self):
        owner = OwnerSession(email=_uid("kushal.tyres"), name="Kushal Tyres")
        shop = owner.bootstrap_shop(
            "auto_tyre",
            wh_name="Main Godown",
            wh_code=f"KT-{uuid.uuid4().hex[:6].upper()}",
            product_name="CEAT SecuraDrive 195/55 R16",
            brand="CEAT",
            category="Tyres",
            cost="3500.00",
            sell="4800.00",
            stock=20,
            size="195/55R16",
        )
        me = owner.me()
        pin_status("AUTH-ME", me, 200)
        pin("AUTH-INDUSTRY", me.data.get("industry") == "auto_tyre", str(me.data))
        pin("AUTH-ROLE-ADMIN", me.data.get("role") == "ADMIN", str(me.data))
        pin("AUTH-ORG", bool(me.data.get("organizationId")), str(me.data))

        setup = owner.patch_setup(
            inventory_location_mode="SINGLE_SHOP",
            barcode_enabled=True,
        )
        pin_status("SETUP-GETSET", setup, 200)
        mode = setup.data.get("inventoryLocationMode") or setup.data.get(
            "inventory_location_mode"
        )
        pin("SETUP-MODE", mode == "SINGLE_SHOP", str(setup.data))

        wh_id = shop["warehouse_id"]
        product = shop["product"]
        product_id = product["id"]
        barcode = product["barcodeValue"]

        res = owner.client.get("/api/v1/inventory/products/")
        pin_status("INV-LIST", res, 200)
        names = [p.get("name") for p in _results(res.data)]
        pin("INV-SEES-OWN", "CEAT SecuraDrive 195/55 R16" in names, str(names))

        res = owner.client.get("/api/v1/inventory/stock/summary/")
        pin_status("INV-SUMMARY", res, 200)
        pin(
            "INV-SUMMARY-COUNT",
            res.data.get("total_products", 0) >= 1,
            str(res.data),
        )

        res = owner.client.get(
            "/api/v1/inventory/pos/products/",
            {"warehouse_id": wh_id},
        )
        pin_status("INV-POS-GRID", res, 200)

        cust = owner.upsert_customer(
            name="Ravi Fleet",
            phone="9876500011",
            email="ravi.fleet@example.com",
            address="Hyderabad",
            gstin="36AABCT1332L1ZB",
        )
        pin_status("CRM-UPSERT", cust, (200, 201))
        cust_id = str(cust.data.get("id") or cust.data.get("customer", {}).get("id") or "")

        res = owner.client.get("/api/v1/customers/", {"is_active": "true"})
        pin_status("CRM-LIST", res, 200)
        phones = [c.get("phone") for c in _results(res.data)]
        pin("CRM-PHONE", any("9876500011" in (p or "") for p in phones), str(phones))

        res = owner.client.get("/api/v1/customers/lookup/", {"phone": "9876500011"})
        pin_status("CRM-LOOKUP", res, 200)

        res = owner.client.get("/api/v1/customers/segments/")
        pin_status("CRM-SEGMENTS", res, 200)

        res = owner.client.get("/api/v1/customers/summary/")
        pin_status("CRM-SUMMARY", res, 200)

        sale = owner.checkout(
            warehouse_id=wh_id,
            product_id=product_id,
            barcode=barcode,
            qty=2,
            amount="9600.00",
            customer_name="Ravi Fleet",
            customer_mobile="9876500011",
            customer_email="ravi.fleet@example.com",
            customer_id=cust_id if cust_id and cust_id != "None" else None,
        )
        pin("POS-INVOICE", bool(sale.data.get("invoice_number")), str(sale.data))
        pin("POS-COMPLETED", sale.data.get("status") == "COMPLETED", str(sale.data))
        sale_id = sale.data.get("sale_id") or sale.data.get("id")
        pin("POS-SALE-ID", bool(sale_id), str(sale.data))

        res = owner.client.get("/api/v1/sales/")
        pin_status("SALE-LIST", res, 200)
        pin("SALE-HAS-ROW", len(_results(res.data)) >= 1, str(res.data))

        res = owner.client.get(f"/api/v1/sales/{sale_id}/")
        pin_status("SALE-DETAIL", res, 200)

        res = owner.client.get("/api/v1/invoices/")
        pin_status("INVCE-LIST", res, 200)

        start, end = _date_window(30)
        report_pins = [
            ("RPT-SALES-SUMMARY", f"/api/v1/reports/sales/summary/?date_from={start}&date_to={end}"),
            ("RPT-SALES-TRENDS", f"/api/v1/reports/sales/trends/?date_from={start}&date_to={end}&group_by=day"),
            ("RPT-SALES-BY-PRODUCT", f"/api/v1/reports/sales/by-product/?date_from={start}&date_to={end}"),
            ("RPT-INV-CURRENT", "/api/v1/reports/inventory/current/?page_size=50"),
            ("RPT-INV-MOVEMENTS", f"/api/v1/reports/inventory/movements/?date_from={start}&date_to={end}&page_size=50"),
            ("RPT-INV-AGING", "/api/v1/reports/inventory/aging/"),
            ("RPT-PROFIT", f"/api/v1/reports/profit/?date_from={start}&date_to={end}"),
            ("RPT-GST", f"/api/v1/reports/tax/gst/?date_from={start}&date_to={end}"),
            ("RPT-RETURNS", f"/api/v1/reports/returns/?date_from={start}&date_to={end}"),
            ("RPT-BY-CATEGORY", f"/api/v1/reports/by-category/?date_from={start}&date_to={end}"),
            ("RPT-BY-BRAND", f"/api/v1/reports/by-brand/?date_from={start}&date_to={end}"),
            ("RPT-BY-WAREHOUSE", f"/api/v1/reports/by-warehouse/?date_from={start}&date_to={end}"),
        ]
        for pin_id, path in report_pins:
            res = owner.client.get(path)
            pin_status(pin_id, res, 200)

        res = owner.client.patch(
            "/api/v1/auth/me/",
            {"name": "Kushal Tyres Owner"},
            format="json",
        )
        pin_status("AUTH-PATCH-ME", res, 200)

        # Own return happy path (admin)
        detail = owner.client.get(f"/api/v1/sales/{sale_id}/")
        pin_status("SALE-DETAIL-RET", detail, 200)
        items = detail.data.get("items") or []
        pin("SALE-HAS-ITEMS", len(items) >= 1, str(detail.data))
        sale_item_id = items[0].get("id")
        ret = owner.client.post(
            "/api/v1/sales/returns/",
            {
                "sale_id": str(sale_id),
                "warehouse_id": wh_id,
                "items": [{"sale_item_id": str(sale_item_id), "quantity": 1}],
                "reason": "Customer size mismatch",
            },
            format="json",
        )
        pin_status("RET-OWN-CREATE", ret, 201)


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class CrossIndustryIsolationTests(TestCase):
    """TENANT-* — FMCG vs F&B never share catalog, CRM, sales, or movements."""

    def test_02_fmcg_and_fnb_owners_fully_isolated(self):
        fmcg = OwnerSession(email=_uid("priya.kirana"), name="Priya Kirana")
        fnb = OwnerSession(email=_uid("arjun.cafe"), name="Arjun Cafe")

        shop_f = fmcg.bootstrap_shop(
            "fmcg",
            wh_name="Kirana Counter",
            wh_code=f"PK-{uuid.uuid4().hex[:5].upper()}",
            product_name="Parle-G 1kg",
            brand="Parle",
            category="Biscuits",
            cost="40.00",
            sell="55.00",
            stock=100,
            setup={"inventory_location_mode": "SINGLE_SHOP", "barcode_enabled": False},
        )
        shop_a = fnb.bootstrap_shop(
            "fnb",
            wh_name="Cafe Store",
            wh_code=f"AC-{uuid.uuid4().hex[:5].upper()}",
            product_name="Cold Brew 500ml",
            brand="House",
            category="Beverages",
            cost="80.00",
            sell="149.00",
            stock=40,
            setup={
                "inventory_location_mode": "GODOWN_AND_SHOPS",
                "shop_stock_mode": "SHARED_GODOWN",
                "barcode_enabled": True,
            },
        )
        pin("TENANT-ORGS-DIFF", shop_f["org_id"] != shop_a["org_id"], "same org leaked")

        pin_status(
            "CRM-F",
            fmcg.upsert_customer(name="Walk-in Asha", phone="9000000001"),
            (200, 201),
        )
        pin_status(
            "CRM-A",
            fnb.upsert_customer(name="Table Guest", phone="9000000002"),
            (200, 201),
        )

        names_f = [
            p.get("name")
            for p in _results(fmcg.client.get("/api/v1/inventory/products/").data)
        ]
        pin("TENANT-F-HAS-OWN", "Parle-G 1kg" in names_f, str(names_f))
        pin("TENANT-F-NO-FOREIGN", "Cold Brew 500ml" not in names_f, str(names_f))

        names_a = [
            p.get("name")
            for p in _results(fnb.client.get("/api/v1/inventory/products/").data)
        ]
        pin("TENANT-A-HAS-OWN", "Cold Brew 500ml" in names_a, str(names_a))
        pin("TENANT-A-NO-FOREIGN", "Parle-G 1kg" not in names_a, str(names_a))

        phones_f = [c.get("phone") for c in _results(fmcg.client.get("/api/v1/customers/").data)]
        pin("TENANT-CRM-F", any("9000000001" in (p or "") for p in phones_f), str(phones_f))
        pin("TENANT-CRM-F-ISO", not any("9000000002" in (p or "") for p in phones_f), str(phones_f))

        # Phone lookup must not cross tenants (same phone registered elsewhere)
        pin_status(
            "CRM-LOOKUP-ISO",
            fmcg.client.get("/api/v1/customers/lookup/", {"phone": "9000000002"}),
            200,
        )
        lookup = fmcg.client.get("/api/v1/customers/lookup/", {"phone": "9000000002"})
        matched = lookup.data.get("matched") if isinstance(lookup.data, dict) else None
        pin("TENANT-LOOKUP-NO-CROSS", matched in (False, None), str(lookup.data))

        fmcg.checkout(
            warehouse_id=shop_f["warehouse_id"],
            product_id=shop_f["product"]["id"],
            barcode=shop_f["product"]["barcodeValue"],
            qty=3,
            amount="165.00",
            customer_name="Walk-in Asha",
            customer_mobile="9000000001",
        )
        fnb.checkout(
            warehouse_id=shop_a["warehouse_id"],
            product_id=shop_a["product"]["id"],
            barcode=shop_a["product"]["barcodeValue"],
            qty=1,
            amount="149.00",
            customer_name="Table Guest",
            customer_mobile="9000000002",
        )

        totals_f = [str(s.get("total")) for s in _results(fmcg.client.get("/api/v1/sales/").data)]
        pin("TENANT-SALE-F", any(t.startswith("165") for t in totals_f), str(totals_f))
        pin("TENANT-SALE-F-ISO", not any(t.startswith("149") for t in totals_f), str(totals_f))

        start, end = _date_window(7)
        mov = fmcg.client.get(
            f"/api/v1/reports/inventory/movements/?date_from={start}&date_to={end}"
        )
        pin_status("RPT-MOV-F", mov, 200)
        move_names = [
            m.get("product_name") or m.get("productName") for m in _results(mov.data)
        ]
        pin("TENANT-MOV-ISO", "Cold Brew 500ml" not in move_names, str(move_names))

        # Direct UUID IDOR: F&B product must 404 for FMCG
        foreign_pid = shop_a["product"]["id"]
        idor = fmcg.client.get(f"/api/v1/inventory/products/{foreign_pid}/")
        pin_status("TENANT-PRODUCT-IDOR", idor, 404)

        foreign_wh = shop_a["warehouse_id"]
        idor_wh = fmcg.client.get(f"/api/v1/inventory/warehouses/{foreign_wh}/")
        pin_status("TENANT-WH-IDOR", idor_wh, 404)


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class MultiBusinessLifecycleTests(TestCase):
    """BIZ-* — one login, many industries; switch/leave/last-admin rules."""

    def test_03_switch_isolates_and_leave_rules(self):
        owner = OwnerSession(email=_uid("multi.owner"), name="Multi Owner")
        shop = owner.bootstrap_shop(
            "auto_tyre",
            wh_name="Tyre Bay",
            wh_code=f"MO-T-{uuid.uuid4().hex[:4].upper()}",
            product_name="MRF ZLX 165/80 R14",
            brand="MRF",
            category="Tyres",
            cost="3000.00",
            sell="4200.00",
            stock=10,
            size="165/80R14",
        )
        tyre_org = shop["org_id"]

        # Empty name rejected
        bad = owner.client.post(
            "/api/v1/auth/businesses/",
            {"name": "   ", "industry": "fmcg"},
            format="json",
        )
        pin_status("BIZ-EMPTY-NAME", bad, 400)

        res = owner.client.post(
            "/api/v1/auth/businesses/",
            {"name": "Multi FMCG Desk", "industry": "fmcg"},
            format="json",
        )
        pin_status("BIZ-CREATE", res, 201)
        pin("BIZ-INDUSTRY", res.data.get("industry") == "fmcg", str(res.data))
        fmcg_org = str(res.data.get("organizationId"))
        pin("BIZ-ORG-DIFF", fmcg_org != str(tyre_org), "same org on add-business")

        res = owner.client.get("/api/v1/inventory/products/")
        pin_status("BIZ-EMPTY-CATALOG", res, 200)
        pin("BIZ-NEW-EMPTY", len(_results(res.data)) == 0, str(res.data))

        pin_status(
            "SETUP-FMCG",
            owner.patch_setup(inventory_location_mode="SINGLE_SHOP", barcode_enabled=False),
            200,
        )
        wh_f = owner.create_warehouse("FMCG Shelf", f"MO-F-{uuid.uuid4().hex[:4].upper()}")
        pin_status("WH-FMCG", wh_f, 201)
        owner.create_product(
            name="Tata Salt 1kg",
            brand="Tata",
            category="Grocery",
            warehouse_id=str(wh_f.data["id"]),
            cost="20.00",
            sell="28.00",
            stock=50,
        )

        res = owner.client.get("/api/v1/auth/businesses/")
        pin_status("BIZ-LIST", res, 200)
        pin("BIZ-COUNT-2", len(res.data) == 2, str(res.data))

        res = owner.client.post(
            "/api/v1/auth/businesses/switch/",
            {"organizationId": str(tyre_org)},
            format="json",
        )
        pin_status("BIZ-SWITCH-TYRE", res, 200)
        pin("BIZ-ACTIVE-TYRE", res.data.get("industry") == "auto_tyre", str(res.data))
        names = [p.get("name") for p in _results(owner.client.get("/api/v1/inventory/products/").data)]
        pin("BIZ-TYRE-SKU", "MRF ZLX 165/80 R14" in names, str(names))
        pin("BIZ-TYRE-NO-SALT", "Tata Salt 1kg" not in names, str(names))

        res = owner.client.post(
            "/api/v1/auth/businesses/switch/",
            {"organizationId": fmcg_org},
            format="json",
        )
        pin_status("BIZ-SWITCH-FMCG", res, 200)
        names = [p.get("name") for p in _results(owner.client.get("/api/v1/inventory/products/").data)]
        pin("BIZ-FMCG-SKU", "Tata Salt 1kg" in names, str(names))
        pin("BIZ-FMCG-NO-TYRE", "MRF ZLX 165/80 R14" not in names, str(names))

        # Industry immutable: mutable industry route must not exist
        try:
            resolve("/api/v1/auth/organization/industry/")
            route_exists = True
        except Resolver404:
            route_exists = False
        pin(
            "BIZ-INDUSTRY-IMMUTABLE",
            not route_exists,
            "Mutable /auth/organization/industry/ route must stay removed",
        )

        res = owner.client.post(
            "/api/v1/auth/businesses/leave/",
            {"organizationId": fmcg_org},
            format="json",
        )
        pin_status("BIZ-LEAVE-FMCG", res, 200)
        pin("BIZ-BACK-TYRE", str(res.data.get("organizationId")) == str(tyre_org), str(res.data))
        pin("BIZ-COUNT-1", len(owner.client.get("/api/v1/auth/businesses/").data) == 1)

        res = owner.client.post(
            "/api/v1/auth/businesses/leave/",
            {"organizationId": str(tyre_org)},
            format="json",
        )
        pin_status("BIZ-LEAVE-LAST", res, 400)

    def test_03b_last_admin_cannot_leave_while_staff_remain(self):
        boss = OwnerSession(email=_uid("last.admin"), name="Last Admin Co")
        boss.register("general")
        org_id = boss.org_id()

        # Second business so leave is not blocked by "only business"
        res = boss.client.post(
            "/api/v1/auth/businesses/",
            {"name": "Side Desk", "industry": "fmcg"},
            format="json",
        )
        pin_status("BIZ-SIDE", res, 201)
        side_id = str(res.data.get("organizationId"))

        # Switch back to original and invite staff there
        pin_status(
            "BIZ-SWITCH-HOME",
            boss.client.post(
                "/api/v1/auth/businesses/switch/",
                {"organizationId": org_id},
                format="json",
            ),
            200,
        )
        invite = boss.client.post(
            "/api/v1/admin/users/",
            {
                "email": _uid("remain.staff"),
                "password": "SecurePass1!",
                "name": "Remain Staff",
                "role": "STAFF",
            },
            format="json",
        )
        pin_status("RBAC-INVITE", invite, 201)

        leave = boss.client.post(
            "/api/v1/auth/businesses/leave/",
            {"organizationId": org_id},
            format="json",
        )
        pin_status("BIZ-LAST-ADMIN-BLOCK", leave, 400)

        # Leaving the side desk (solo admin, no other members) must succeed
        leave_side = boss.client.post(
            "/api/v1/auth/businesses/leave/",
            {"organizationId": side_id},
            format="json",
        )
        pin_status("BIZ-LEAVE-SOLO-OK", leave_side, 200)


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class RBACStaffPrivilegeTests(TestCase):
    """RBAC-* — STAFF can sell; cannot admin warehouses / returns / profit reports."""

    def test_04_staff_boundaries_and_isolation(self):
        boss = OwnerSession(email=_uid("boss.shop"), name="Boss Shop")
        other = OwnerSession(email=_uid("other.shop"), name="Other Shop")
        shop = boss.bootstrap_shop(
            "general",
            wh_name="Boss WH",
            wh_code=f"B-{uuid.uuid4().hex[:5].upper()}",
            product_name="Boss SKU Only",
            brand="Boss",
            category="General",
            cost="10.00",
            sell="20.00",
            stock=8,
        )
        other.bootstrap_shop(
            "general",
            wh_name="Other WH",
            wh_code=f"O-{uuid.uuid4().hex[:5].upper()}",
            product_name="Secret Other SKU",
            brand="Other",
            category="General",
            cost="10.00",
            sell="20.00",
            stock=5,
        )

        staff_email = _uid("cashier")
        invite = boss.client.post(
            "/api/v1/admin/users/",
            {
                "email": staff_email,
                "password": "SecurePass1!",
                "name": "Cashier One",
                "role": "STAFF",
            },
            format="json",
        )
        pin_status("RBAC-INVITE", invite, 201)

        staff = OwnerSession(email=staff_email)
        pin_status("RBAC-LOGIN", staff.login(), 200)
        me = staff.me()
        pin_status("RBAC-ME", me, 200)
        pin("RBAC-ROLE", me.data.get("role") == "STAFF", str(me.data))
        pin(
            "RBAC-ORG",
            str(me.data.get("organizationId")) == str(boss.user.get("organizationId")),
            str(me.data),
        )

        names = [p.get("name") for p in _results(staff.client.get("/api/v1/inventory/products/").data)]
        pin("RBAC-SEES-BOSS", "Boss SKU Only" in names, str(names))
        pin("RBAC-NO-OTHER", "Secret Other SKU" not in names, str(names))

        # Staff can checkout
        sale = staff.checkout(
            warehouse_id=shop["warehouse_id"],
            product_id=shop["product"]["id"],
            barcode=shop["product"]["barcodeValue"],
            qty=1,
            amount="20.00",
            customer_name="Walk-in",
            customer_mobile="9111111111",
        )
        pin("RBAC-STAFF-POS", sale.data.get("success") is True, str(sale.data))

        # Staff cannot create warehouse
        wh = staff.client.post(
            "/api/v1/inventory/warehouses/",
            {
                "name": "Nope",
                "code": "NOPE",
                "address": "12 Market Road enough chars",
            },
            format="json",
        )
        pin_status("RBAC-STAFF-NO-WH", wh, 403)

        # Staff cannot create product
        prod = staff.client.post(
            "/api/v1/inventory/products/",
            {
                "name": "Illegal",
                "brand": "X",
                "category": "Y",
                "warehouse_id": shop["warehouse_id"],
                "pricing": {
                    "cost_price": "1.00",
                    "mrp": "2.00",
                    "selling_price": "2.00",
                    "gst_percentage": "18.00",
                },
                "variants": [
                    {
                        "size": "",
                        "cost_price": "1.00",
                        "selling_price": "2.00",
                        "initial_stock": 1,
                        "reorder_threshold": 1,
                    }
                ],
            },
            format="json",
        )
        pin_status("RBAC-STAFF-NO-PRODUCT", prod, 403)

        # Staff cannot stock-adjust (IsAdmin on /inventory/stock/adjust/)
        if shop["product"].get("variant_id"):
            adj = staff.client.post(
                "/api/v1/inventory/stock/adjust/",
                {
                    "warehouse_id": shop["warehouse_id"],
                    "variant_id": shop["product"]["variant_id"],
                    "quantity": -1,
                    "notes": "Trying to adjust without admin rights",
                },
                format="json",
            )
            pin_status("RBAC-STAFF-NO-ADJUST", adj, 403)

        # Staff cannot create returns
        sale_id = sale.data.get("sale_id")
        detail = boss.client.get(f"/api/v1/sales/{sale_id}/")
        items = detail.data.get("items") or []
        if items:
            ret = staff.client.post(
                "/api/v1/sales/returns/",
                {
                    "sale_id": str(sale_id),
                    "warehouse_id": shop["warehouse_id"],
                    "items": [{"sale_item_id": str(items[0].get("id")), "quantity": 1}],
                    "reason": "Staff should not return",
                },
                format="json",
            )
            pin_status("RBAC-STAFF-NO-RETURN", ret, 403)

        # Staff blocked from admin-only profit/GST reports
        start, end = _date_window(7)
        pin_status(
            "RBAC-STAFF-NO-PROFIT",
            staff.client.get(f"/api/v1/reports/profit/?date_from={start}&date_to={end}"),
            403,
        )
        pin_status(
            "RBAC-STAFF-NO-GST",
            staff.client.get(f"/api/v1/reports/tax/gst/?date_from={start}&date_to={end}"),
            403,
        )
        # Staff may read sales summary
        pin_status(
            "RBAC-STAFF-SALES-SUMMARY",
            staff.client.get(f"/api/v1/reports/sales/summary/?date_from={start}&date_to={end}"),
            200,
        )

        # Staff cannot invite users
        pin_status(
            "RBAC-STAFF-NO-INVITE",
            staff.client.post(
                "/api/v1/admin/users/",
                {
                    "email": _uid("ghost"),
                    "password": "SecurePass1!",
                    "name": "Ghost",
                    "role": "STAFF",
                },
                format="json",
            ),
            403,
        )


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class SessionPersistenceTests(TestCase):
    """SESS-* — active org survives re-login."""

    def test_05_relogin_preserves_active_business(self):
        owner = OwnerSession(email=_uid("relogin"), name="Relogin Owner")
        owner.register("fnb")
        org_id = owner.org_id()

        res = owner.client.post(
            "/api/v1/auth/businesses/",
            {"name": "Second Cafe", "industry": "fmcg"},
            format="json",
        )
        pin_status("SESS-ADD", res, 201)
        second_id = str(res.data.get("organizationId"))

        pin_status(
            "SESS-SWITCH-1",
            owner.client.post(
                "/api/v1/auth/businesses/switch/",
                {"organizationId": org_id},
                format="json",
            ),
            200,
        )
        pin_status("SESS-LOGIN-1", owner.login(), 200)
        pin("SESS-ACTIVE-1", owner.org_id() == org_id, owner.org_id())

        pin_status(
            "SESS-SWITCH-2",
            owner.client.post(
                "/api/v1/auth/businesses/switch/",
                {"organizationId": second_id},
                format="json",
            ),
            200,
        )
        pin_status("SESS-LOGIN-2", owner.login(), 200)
        pin("SESS-ACTIVE-2", owner.org_id() == second_id, owner.org_id())


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class TenantBoundarySecurityTests(TestCase):
    """
    TENANT-*/RET-* — adversarial UUID guessing & membership abuse.

    These assert *secure* contracts. Failures here are production bugs.
    """

    def test_06_cannot_switch_or_leave_foreign_business(self):
        a = OwnerSession(email=_uid("alpha"), name="Alpha")
        b = OwnerSession(email=_uid("beta"), name="Beta")
        a.register("auto_tyre")
        b.register("fmcg")
        foreign = b.org_id()

        pin_status(
            "TENANT-SWITCH-FOREIGN",
            a.client.post(
                "/api/v1/auth/businesses/switch/",
                {"organizationId": foreign},
                format="json",
            ),
            400,
        )
        pin_status(
            "TENANT-LEAVE-FOREIGN",
            a.client.post(
                "/api/v1/auth/businesses/leave/",
                {"organizationId": foreign},
                format="json",
            ),
            400,
        )

    def test_06b_customer_and_sale_uuid_idor(self):
        a = OwnerSession(email=_uid("idor.a"), name="IDOR A")
        b = OwnerSession(email=_uid("idor.b"), name="IDOR B")
        shop_a = a.bootstrap_shop(
            "auto_tyre",
            wh_name="A WH",
            wh_code=f"IA-{uuid.uuid4().hex[:5].upper()}",
            product_name="A Only Tyre",
            brand="A",
            category="Tyres",
            cost="100.00",
            sell="150.00",
            stock=5,
        )
        shop_b = b.bootstrap_shop(
            "fmcg",
            wh_name="B WH",
            wh_code=f"IB-{uuid.uuid4().hex[:5].upper()}",
            product_name="B Only Salt",
            brand="B",
            category="Grocery",
            cost="10.00",
            sell="15.00",
            stock=5,
        )

        cust_b = b.upsert_customer(name="Secret Buyer", phone="9222222222")
        pin_status("CRM-B", cust_b, (200, 201))
        cust_b_id = str(cust_b.data.get("id") or cust_b.data.get("customer", {}).get("id"))

        idor_cust = a.client.get(f"/api/v1/customers/{cust_b_id}/")
        pin_status("TENANT-CUST-IDOR", idor_cust, 404)

        sale_b = b.checkout(
            warehouse_id=shop_b["warehouse_id"],
            product_id=shop_b["product"]["id"],
            barcode=shop_b["product"]["barcodeValue"],
            qty=1,
            amount="15.00",
            customer_name="Secret Buyer",
            customer_mobile="9222222222",
        )
        sale_b_id = sale_b.data.get("sale_id")
        idor_sale = a.client.get(f"/api/v1/sales/{sale_b_id}/")
        pin_status("TENANT-SALE-IDOR", idor_sale, 404)

        # Checkout with foreign warehouse must fail (not complete against other org stock)
        xcheckout = a.checkout(
            warehouse_id=shop_b["warehouse_id"],
            product_id=shop_a["product"]["id"],
            barcode=shop_a["product"]["barcodeValue"],
            qty=1,
            amount="150.00",
            expect_success=False,
        )
        pin(
            "TENANT-CHECKOUT-FOREIGN-WH",
            xcheckout.status_code in (400, 403, 404),
            f"status={xcheckout.status_code} body={xcheckout.data}",
        )

        # Cross-org return must not succeed
        detail = b.client.get(f"/api/v1/sales/{sale_b_id}/")
        items = detail.data.get("items") or []
        pin("RET-HAS-ITEMS", len(items) >= 1, str(detail.data))
        xret = a.client.post(
            "/api/v1/sales/returns/",
            {
                "sale_id": str(sale_b_id),
                "warehouse_id": shop_b["warehouse_id"],
                "items": [{"sale_item_id": str(items[0].get("id")), "quantity": 1}],
                "reason": "Attacker trying foreign return",
            },
            format="json",
        )
        pin(
            "TENANT-RETURN-IDOR",
            xret.status_code in (400, 403, 404),
            f"Cross-org return must be denied; got {xret.status_code} {xret.data}",
        )

    def test_06c_returns_list_must_not_leak_foreign_org(self):
        a = OwnerSession(email=_uid("ret.a"), name="Ret A")
        b = OwnerSession(email=_uid("ret.b"), name="Ret B")
        shop_a = a.bootstrap_shop(
            "general",
            wh_name="RA WH",
            wh_code=f"RA-{uuid.uuid4().hex[:5].upper()}",
            product_name="RetA SKU",
            brand="A",
            category="G",
            cost="10.00",
            sell="20.00",
            stock=5,
        )
        shop_b = b.bootstrap_shop(
            "general",
            wh_name="RB WH",
            wh_code=f"RB-{uuid.uuid4().hex[:5].upper()}",
            product_name="RetB SKU",
            brand="B",
            category="G",
            cost="10.00",
            sell="20.00",
            stock=5,
        )

        sale_b = b.checkout(
            warehouse_id=shop_b["warehouse_id"],
            product_id=shop_b["product"]["id"],
            barcode=shop_b["product"]["barcodeValue"],
            qty=1,
            amount="20.00",
        )
        sale_b_id = sale_b.data.get("sale_id")
        detail = b.client.get(f"/api/v1/sales/{sale_b_id}/")
        items = detail.data.get("items") or []
        ret_b = b.client.post(
            "/api/v1/sales/returns/",
            {
                "sale_id": str(sale_b_id),
                "warehouse_id": shop_b["warehouse_id"],
                "items": [{"sale_item_id": str(items[0].get("id")), "quantity": 1}],
                "reason": "B customer return",
            },
            format="json",
        )
        pin_status("RET-B-CREATE", ret_b, 201)
        ret_b_id = str(ret_b.data.get("return_id"))

        findings: list[str] = []

        # GET list must work and stay org-scoped
        listed = a.client.get("/api/v1/sales/returns/")
        if listed.status_code != 200:
            findings.append(
                f"[RET-LIST-ROUTE] GET /sales/returns/ must list org-scoped returns; "
                f"got {listed.status_code} {listed.data}"
            )
        else:
            ids = [
                str(row.get("id") or row.get("return_id") or "")
                for row in _results(listed.data)
            ]
            if ret_b_id in ids:
                findings.append(
                    f"[TENANT-RETURNS-LIST-ISO] Returns list leaked foreign return "
                    f"{ret_b_id}: {ids}"
                )

        # Retrieve by id must 404 for foreign org (IDOR)
        get_foreign = a.client.get(f"/api/v1/sales/returns/{ret_b_id}/")
        if get_foreign.status_code != 404:
            findings.append(
                f"[TENANT-RETURNS-DETAIL-ISO] Foreign return detail visible: "
                f"{get_foreign.status_code} {get_foreign.data}"
            )

        _ = shop_a
        if findings:
            raise PinFailure("Returns tenancy board:\n" + "\n".join(findings))



@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class POSIntegrityTests(TestCase):
    """POS-* — idempotency, stock exhaustion, payment validation."""

    def test_07_idempotency_and_oversell(self):
        owner = OwnerSession(email=_uid("pos.integrity"), name="POS Integrity")
        shop = owner.bootstrap_shop(
            "fmcg",
            wh_name="POS WH",
            wh_code=f"PI-{uuid.uuid4().hex[:5].upper()}",
            product_name="Idempotent Chips",
            brand="Lay",
            category="Snacks",
            cost="10.00",
            sell="20.00",
            stock=2,
        )
        key = str(uuid.uuid4())
        first = owner.checkout(
            warehouse_id=shop["warehouse_id"],
            product_id=shop["product"]["id"],
            barcode=shop["product"]["barcodeValue"],
            qty=1,
            amount="20.00",
            idempotency_key=key,
        )
        second = owner.checkout(
            warehouse_id=shop["warehouse_id"],
            product_id=shop["product"]["id"],
            barcode=shop["product"]["barcodeValue"],
            qty=1,
            amount="20.00",
            idempotency_key=key,
            expect_success=True,
        )
        pin(
            "POS-IDEMPOTENT-SAME-SALE",
            str(first.data.get("sale_id")) == str(second.data.get("sale_id")),
            f"first={first.data} second={second.data}",
        )
        pin(
            "POS-IDEMPOTENT-STATUS",
            second.status_code in (200, 201),
            f"status={second.status_code}",
        )

        # Remaining stock = 1; oversell qty=5 must fail
        oversell = owner.checkout(
            warehouse_id=shop["warehouse_id"],
            product_id=shop["product"]["id"],
            barcode=shop["product"]["barcodeValue"],
            qty=5,
            amount="100.00",
            expect_success=False,
        )
        pin(
            "POS-OVERSELL",
            oversell.status_code in (400, 409),
            f"oversell allowed: {oversell.status_code} {oversell.data}",
        )

        # Underpay must fail
        underpay = owner.client.post(
            "/api/v1/sales/checkout/",
            {
                "idempotency_key": str(uuid.uuid4()),
                "warehouse_id": shop["warehouse_id"],
                "items": [
                    {
                        "product_id": shop["product"]["id"],
                        "quantity": 1,
                    }
                ],
                "payments": [{"method": "CASH", "amount": "1.00"}],
                "apply_automatic_gst": False,
            },
            format="json",
        )
        pin(
            "POS-UNDERPAY",
            underpay.status_code in (400, 422),
            f"underpay accepted: {underpay.status_code} {underpay.data}",
        )

    def test_07b_stock_adjust_foreign_variant_must_fail(self):
        a = OwnerSession(email=_uid("adj.a"), name="Adj A")
        b = OwnerSession(email=_uid("adj.b"), name="Adj B")
        shop_a = a.bootstrap_shop(
            "general",
            wh_name="AdjA",
            wh_code=f"AA-{uuid.uuid4().hex[:5].upper()}",
            product_name="AdjA SKU",
            brand="A",
            category="G",
            cost="5.00",
            sell="9.00",
            stock=10,
        )
        shop_b = b.bootstrap_shop(
            "general",
            wh_name="AdjB",
            wh_code=f"AB-{uuid.uuid4().hex[:5].upper()}",
            product_name="AdjB SKU",
            brand="B",
            category="G",
            cost="5.00",
            sell="9.00",
            stock=10,
        )
        pin("INV-VARIANT-B", bool(shop_b["product"].get("variant_id")), str(shop_b["product"]))

        findings: list[str] = []

        # A tries to adjust B's variant into A's warehouse
        attack = a.client.post(
            "/api/v1/inventory/stock/adjust/",
            {
                "warehouse_id": shop_a["warehouse_id"],
                "variant_id": shop_b["product"]["variant_id"],
                "quantity": 1,
                "notes": "Cross-tenant stock injection attempt",
            },
            format="json",
        )
        if attack.status_code not in (400, 403, 404):
            findings.append(
                f"[TENANT-STOCK-ADJUST-IDOR] Cross-org stock adjust succeeded: "
                f"{attack.status_code} {attack.data}"
            )

        # A tries adjust using B's warehouse id
        attack2 = a.client.post(
            "/api/v1/inventory/stock/adjust/",
            {
                "warehouse_id": shop_b["warehouse_id"],
                "variant_id": shop_a["product"]["variant_id"],
                "quantity": 1,
                "notes": "Cross-tenant warehouse adjust attempt",
            },
            format="json",
        )
        if attack2.status_code not in (400, 403, 404):
            findings.append(
                f"[TENANT-STOCK-ADJUST-WH-IDOR] Foreign warehouse adjust succeeded: "
                f"{attack2.status_code} {attack2.data}"
            )

        if findings:
            raise PinFailure("Stock-adjust tenancy board:\n" + "\n".join(findings))


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class GeneralIndustryOwnerSmokeTests(TestCase):
    """general industry owner can complete a minimal sell cycle."""

    def test_08_general_owner_minimal_cycle(self):
        owner = OwnerSession(email=_uid("general.shop"), name="General Mart")
        shop = owner.bootstrap_shop(
            "general",
            wh_name="Front Counter",
            wh_code=f"GM-{uuid.uuid4().hex[:5].upper()}",
            product_name="Utility Item Pack",
            brand="Generic",
            category="Misc",
            cost="25.00",
            sell="40.00",
            stock=15,
        )
        pin("AUTH-GEN-INDUSTRY", owner.me().data.get("industry") == "general")
        sale = owner.checkout(
            warehouse_id=shop["warehouse_id"],
            product_id=shop["product"]["id"],
            barcode=shop["product"]["barcodeValue"],
            qty=2,
            amount="80.00",
            customer_name="Cash Customer",
            customer_mobile="9333333333",
        )
        pin("POS-GEN-OK", sale.data.get("status") == "COMPLETED", str(sale.data))

        biz = owner.client.get("/api/v1/auth/businesses/")
        pin_status("BIZ-GEN-LIST", biz, 200)
        pin("BIZ-GEN-ONE", len(biz.data) == 1, str(biz.data))
        pin("BIZ-GEN-ACTIVE", any(row.get("isActive") for row in biz.data), str(biz.data))
