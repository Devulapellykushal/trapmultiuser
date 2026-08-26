"""
Settings journeys — sit at each business counter and exercise full setup.

Covers every industry (auto_tyre, fmcg, fnb, general):
  register → GET/PATCH business-setup (layout, barcode, GST)
  → create storage (warehouse) → empty inventory until stocked
  → settings isolation across multi-business switch
  → STAFF cannot change setup

Run:
  python manage.py test users.tests_settings_journeys --keepdb -v2
"""

from __future__ import annotations

import uuid
from typing import Any

from django.test import TestCase, override_settings
from rest_framework.test import APIClient


INDUSTRIES = ("auto_tyre", "fmcg", "fnb", "general")


def _uid(prefix: str) -> str:
    return f"{prefix}.{uuid.uuid4().hex[:10]}@settings.journey"


def pin(pin_id: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"[{pin_id}] {detail}")


def pin_status(pin_id: str, response, expected: int | tuple[int, ...], detail: str = "") -> None:
    if isinstance(expected, int):
        expected = (expected,)
    if response.status_code not in expected:
        raise AssertionError(
            f"[{pin_id}] expected {expected}, got {response.status_code}. "
            f"{detail} body={getattr(response, 'data', None)}"
        )


def _bool_field(data: dict, *keys: str, default: bool = True) -> bool:
    for key in keys:
        if key in data and data[key] is not None:
            return bool(data[key])
    return default


def _str_field(data: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        if key in data and data[key] is not None:
            return str(data[key])
    return default


class CounterSession:
    """One owner sitting at one business counter."""

    def __init__(self, email: str, name: str = "", password: str = "SecurePass1!"):
        self.email = email
        self.password = password
        self.name = name or email.split("@")[0].replace(".", " ").title()
        self.client = APIClient()
        self.access: str | None = None
        self.user: dict | None = None

    def auth(self) -> None:
        if self.access:
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")

    def register(self, industry: str) -> Any:
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
        pin_status(f"AUTH-REG-{industry}", res, 201)
        self.access = res.data["access"]
        self.user = res.data["user"]
        self.auth()
        pin(
            f"AUTH-INDUSTRY-{industry}",
            self.user.get("industry") == industry,
            str(self.user),
        )
        return res

    def login(self) -> Any:
        res = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.email, "password": self.password},
            format="json",
        )
        pin_status("AUTH-LOGIN", res, 200)
        self.access = res.data["access"]
        self.user = res.data["user"]
        self.auth()
        return res

    def get_setup(self) -> Any:
        return self.client.get("/api/v1/invoices/settings/business-setup/")

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

    def list_warehouses(self) -> Any:
        return self.client.get("/api/v1/inventory/warehouses/")

    def list_products(self) -> Any:
        return self.client.get("/api/v1/inventory/products/")


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class SettingsPerIndustryCounterTests(TestCase):
    """Full settings desk for each industry counter."""

    def test_01_each_industry_settings_desk(self):
        for industry in INDUSTRIES:
            with self.subTest(industry=industry):
                self._run_counter_settings(industry)

    def _run_counter_settings(self, industry: str) -> None:
        owner = CounterSession(
            email=_uid(f"desk.{industry}"),
            name=f"{industry.replace('_', ' ').title()} Desk",
        )
        owner.register(industry)

        # --- Defaults ---
        res = owner.get_setup()
        pin_status(f"SETUP-GET-{industry}", res, 200)
        pin(
            f"SETUP-DEFAULT-BARCODE-{industry}",
            _bool_field(res.data, "barcode_enabled", "barcodeEnabled") is True,
            str(res.data),
        )
        pin(
            f"SETUP-DEFAULT-GST-{industry}",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is True,
            str(res.data),
        )
        mode = _str_field(
            res.data,
            "inventory_location_mode",
            "inventoryLocationMode",
        )
        pin(
            f"SETUP-DEFAULT-MODE-{industry}",
            mode in ("SINGLE_SHOP", "GODOWN_AND_SHOPS"),
            str(res.data),
        )

        # --- Empty storage before warehouse ---
        wh_list = owner.list_warehouses()
        pin_status(f"WH-LIST-EMPTY-{industry}", wh_list, 200)
        rows = wh_list.data if isinstance(wh_list.data, list) else wh_list.data.get("results", [])
        pin(
            f"WH-NONE-YET-{industry}",
            len(rows) == 0,
            f"expected no storage yet, got {rows}",
        )

        # --- Toggle GST off / barcodes off / one-shop layout ---
        res = owner.patch_setup(
            inventory_location_mode="SINGLE_SHOP",
            shop_stock_mode="TRANSFER",
            barcode_enabled=False,
            gst_enabled=False,
        )
        pin_status(f"SETUP-PATCH-OFF-{industry}", res, 200)
        pin(
            f"SETUP-GST-OFF-{industry}",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is False,
            str(res.data),
        )
        pin(
            f"SETUP-BARCODE-OFF-{industry}",
            _bool_field(res.data, "barcode_enabled", "barcodeEnabled") is False,
            str(res.data),
        )
        pin(
            f"SETUP-MODE-SINGLE-{industry}",
            _str_field(res.data, "inventory_location_mode", "inventoryLocationMode")
            == "SINGLE_SHOP",
            str(res.data),
        )

        # --- Toggle GST + barcodes back on; godown layout for non-general ---
        want_mode = (
            "GODOWN_AND_SHOPS" if industry in ("auto_tyre", "fmcg") else "SINGLE_SHOP"
        )
        want_shop = "SHARED_GODOWN" if want_mode == "GODOWN_AND_SHOPS" else "TRANSFER"
        res = owner.patch_setup(
            inventory_location_mode=want_mode,
            shop_stock_mode=want_shop,
            barcode_enabled=True,
            gst_enabled=True,
        )
        pin_status(f"SETUP-PATCH-ON-{industry}", res, 200)
        pin(
            f"SETUP-GST-ON-{industry}",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is True,
            str(res.data),
        )
        pin(
            f"SETUP-MODE-SAVED-{industry}",
            _str_field(res.data, "inventory_location_mode", "inventoryLocationMode")
            == want_mode,
            str(res.data),
        )

        # --- Create storage (shop / godown) ---
        code = f"{industry[:3].upper()}-{uuid.uuid4().hex[:5].upper()}"
        wh = owner.create_warehouse(f"{industry} Main Counter", code)
        pin_status(f"WH-CREATE-{industry}", wh, 201)
        pin(f"WH-HAS-ID-{industry}", bool(wh.data.get("id")), str(wh.data))

        wh_list = owner.list_warehouses()
        pin_status(f"WH-LIST-{industry}", wh_list, 200)
        rows = wh_list.data if isinstance(wh_list.data, list) else wh_list.data.get("results", [])
        pin(f"WH-COUNT-1-{industry}", len(rows) >= 1, str(rows))

        # --- Persist across re-login ---
        owner.login()
        res = owner.get_setup()
        pin_status(f"SETUP-RELOGIN-{industry}", res, 200)
        pin(
            f"SETUP-RELOGIN-GST-{industry}",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is True,
            str(res.data),
        )
        pin(
            f"SETUP-RELOGIN-MODE-{industry}",
            _str_field(res.data, "inventory_location_mode", "inventoryLocationMode")
            == want_mode,
            str(res.data),
        )
        wh_list = owner.list_warehouses()
        rows = wh_list.data if isinstance(wh_list.data, list) else wh_list.data.get("results", [])
        pin(f"WH-RELOGIN-{industry}", len(rows) >= 1, str(rows))

        # Catalogue still empty until products added
        prods = owner.list_products()
        pin_status(f"INV-EMPTY-{industry}", prods, 200)
        prod_rows = (
            prods.data if isinstance(prods.data, list) else prods.data.get("results", [])
        )
        pin(f"INV-EMPTY-OK-{industry}", len(prod_rows) == 0, str(prod_rows))


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class SettingsMultiBusinessIsolationTests(TestCase):
    """One login, two counters — settings must not bleed across switch."""

    def test_02_settings_isolated_per_business(self):
        owner = CounterSession(
            email=_uid("multi.settings"),
            name="Multi Settings Owner",
        )
        owner.register("auto_tyre")
        tyre_org = str(owner.user.get("organizationId"))

        # Tyre counter: GST off, barcodes off, single shop
        res = owner.patch_setup(
            inventory_location_mode="SINGLE_SHOP",
            barcode_enabled=False,
            gst_enabled=False,
        )
        pin_status("ISO-TYRE-SETUP", res, 200)
        wh = owner.create_warehouse("Tyre Bay", f"TB-{uuid.uuid4().hex[:5].upper()}")
        pin_status("ISO-TYRE-WH", wh, 201)

        # Add FMCG business (switches active)
        res = owner.client.post(
            "/api/v1/auth/businesses/",
            {"name": "Kirana Counter", "industry": "fmcg"},
            format="json",
        )
        pin_status("ISO-ADD-FMCG", res, 201)
        fmcg_org = str(res.data.get("organizationId"))
        pin("ISO-ORGS-DIFF", fmcg_org != tyre_org, f"{fmcg_org} vs {tyre_org}")

        # New counter defaults: GST on, barcodes on, empty warehouses
        res = owner.get_setup()
        pin_status("ISO-FMCG-GET", res, 200)
        pin(
            "ISO-FMCG-GST-DEFAULT",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is True,
            "FMCG should not inherit tyre GST-off",
        )
        pin(
            "ISO-FMCG-BARCODE-DEFAULT",
            _bool_field(res.data, "barcode_enabled", "barcodeEnabled") is True,
            "FMCG should not inherit tyre barcode-off",
        )
        wh_list = owner.list_warehouses()
        rows = wh_list.data if isinstance(wh_list.data, list) else wh_list.data.get("results", [])
        pin("ISO-FMCG-WH-EMPTY", len(rows) == 0, f"leaked tyre WH: {rows}")

        # Configure FMCG differently
        res = owner.patch_setup(
            inventory_location_mode="GODOWN_AND_SHOPS",
            shop_stock_mode="TRANSFER",
            barcode_enabled=True,
            gst_enabled=True,
        )
        pin_status("ISO-FMCG-SETUP", res, 200)
        wh = owner.create_warehouse("FMCG Shelf", f"FS-{uuid.uuid4().hex[:5].upper()}")
        pin_status("ISO-FMCG-WH", wh, 201)

        # Switch back to tyre — prior settings intact
        res = owner.client.post(
            "/api/v1/auth/businesses/switch/",
            {"organizationId": tyre_org},
            format="json",
        )
        pin_status("ISO-SWITCH-TYRE", res, 200)
        res = owner.get_setup()
        pin_status("ISO-TYRE-GET-BACK", res, 200)
        pin(
            "ISO-TYRE-GST-STILL-OFF",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is False,
            str(res.data),
        )
        pin(
            "ISO-TYRE-BARCODE-STILL-OFF",
            _bool_field(res.data, "barcode_enabled", "barcodeEnabled") is False,
            str(res.data),
        )
        pin(
            "ISO-TYRE-MODE-SINGLE",
            _str_field(res.data, "inventory_location_mode", "inventoryLocationMode")
            == "SINGLE_SHOP",
            str(res.data),
        )
        wh_list = owner.list_warehouses()
        rows = wh_list.data if isinstance(wh_list.data, list) else wh_list.data.get("results", [])
        names = [r.get("name") for r in rows]
        pin("ISO-TYRE-SEES-OWN-WH", any("Tyre Bay" in (n or "") for n in names), str(names))
        pin("ISO-TYRE-NO-FMCG-WH", not any("FMCG Shelf" in (n or "") for n in names), str(names))

        # Switch to FMCG again
        res = owner.client.post(
            "/api/v1/auth/businesses/switch/",
            {"organizationId": fmcg_org},
            format="json",
        )
        pin_status("ISO-SWITCH-FMCG", res, 200)
        res = owner.get_setup()
        pin(
            "ISO-FMCG-GST-STILL-ON",
            _bool_field(res.data, "gst_enabled", "gstEnabled") is True,
            str(res.data),
        )
        pin(
            "ISO-FMCG-MODE-GODOWN",
            _str_field(res.data, "inventory_location_mode", "inventoryLocationMode")
            == "GODOWN_AND_SHOPS",
            str(res.data),
        )


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class SettingsRBACTests(TestCase):
    """STAFF at the counter can read setup but cannot change it."""

    def test_03_staff_cannot_patch_business_setup(self):
        boss = CounterSession(email=_uid("boss.settings"), name="Boss Settings")
        boss.register("general")
        boss.patch_setup(gst_enabled=True, barcode_enabled=True)
        boss.create_warehouse("Boss Shop", f"BS-{uuid.uuid4().hex[:5].upper()}")

        staff_email = _uid("cashier.settings")
        invite = boss.client.post(
            "/api/v1/admin/users/",
            {
                "email": staff_email,
                "password": "SecurePass1!",
                "name": "Cashier Settings",
                "role": "STAFF",
            },
            format="json",
        )
        pin_status("RBAC-INVITE", invite, 201)

        staff = CounterSession(email=staff_email)
        staff.login()

        res = staff.get_setup()
        pin_status("RBAC-STAFF-GET", res, 200)

        res = staff.patch_setup(gst_enabled=False, barcode_enabled=False)
        pin_status("RBAC-STAFF-NO-PATCH", res, 403)

        res = staff.create_warehouse("Staff Nope", "NOPE-1")
        pin_status("RBAC-STAFF-NO-WH", res, 403)


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class SettingsInvalidPayloadTests(TestCase):
    """Bad settings payloads rejected cleanly."""

    def test_04_invalid_location_mode_rejected(self):
        owner = CounterSession(email=_uid("bad.setup"), name="Bad Setup")
        owner.register("fnb")
        res = owner.patch_setup(inventory_location_mode="NOT_A_MODE")
        pin_status("SETUP-BAD-MODE", res, 400)

    def test_05_fnb_and_general_gst_toggle_roundtrip(self):
        """Cafe + general retail: GST off then on again at the same counter."""
        for industry in ("fnb", "general"):
            with self.subTest(industry=industry):
                owner = CounterSession(
                    email=_uid(f"gst.{industry}"),
                    name=f"{industry} GST Desk",
                )
                owner.register(industry)
                off = owner.patch_setup(gst_enabled=False)
                pin_status(f"GST-OFF-{industry}", off, 200)
                pin(
                    f"GST-OFF-VAL-{industry}",
                    _bool_field(off.data, "gst_enabled", "gstEnabled") is False,
                    str(off.data),
                )
                on = owner.patch_setup(gst_enabled=True)
                pin_status(f"GST-ON-{industry}", on, 200)
                pin(
                    f"GST-ON-VAL-{industry}",
                    _bool_field(on.data, "gst_enabled", "gstEnabled") is True,
                    str(on.data),
                )
