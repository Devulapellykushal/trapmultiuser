"""
Auth + organization isolation tests.

Safety rule: a newly registered user must NEVER see another business's data
(e.g. Thirumala / admin@thirumalawheels.com inventory, customers, sales).
"""

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from customers.models import Customer
from inventory.models import Warehouse, Product
from users.models import Organization, User
from users.services import auth_service


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class OrganizationIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.thirumala = Organization.objects.create(
            name="Thirumala Wheels",
            slug="thirumala-wheels-test",
        )
        self.admin = User.objects.create_user(
            username="admin_thiru",
            email="admin-isolation@example.com",
            password="Kushal@12",
            role=User.Role.ADMIN,
            organization=self.thirumala,
        )
        self.warehouse = Warehouse.objects.create(
            name="Thirumala Main",
            code="THI-MAIN",
            organization=self.thirumala,
        )
        self.product = Product.objects.create(
            name="Thirumala Tyre Secret",
            brand="MRF",
            category="Tyre",
            sku="THI-SKU-001",
            organization=self.thirumala,
        )
        self.customer = Customer.objects.create(
            name="Thirumala Fleet Buyer",
            phone="9876543210",
            organization=self.thirumala,
        )

    def _auth(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_register_creates_new_organization_not_thirumala(self):
        user = auth_service.register_user(
            email="newbie@example.com",
            password="SecurePass1!",
            name="New Owner",
        )
        self.assertIsNotNone(user.organization_id)
        self.assertNotEqual(user.organization_id, self.thirumala.id)
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertNotEqual(user.organization.slug, self.thirumala.slug)

    def test_new_user_cannot_list_thirumala_warehouses(self):
        user = auth_service.register_user(
            email="shop2@example.com",
            password="SecurePass1!",
            name="Shop Two",
        )
        client = self._auth(user)
        res = client.get("/api/v1/inventory/warehouses/")
        self.assertEqual(res.status_code, 200)
        results = res.data.get("results", res.data)
        if isinstance(results, dict):
            results = results.get("results", [])
        names = [w.get("name") for w in results]
        self.assertNotIn("Thirumala Main", names)
        self.assertEqual(len(results), 0)

    def test_new_user_cannot_list_thirumala_products(self):
        user = auth_service.register_user(
            email="shop3@example.com",
            password="SecurePass1!",
            name="Shop Three",
        )
        client = self._auth(user)
        res = client.get("/api/v1/inventory/products/")
        self.assertEqual(res.status_code, 200)
        results = res.data.get("results", res.data)
        names = [p.get("name") for p in results]
        self.assertNotIn("Thirumala Tyre Secret", names)

    def test_new_user_cannot_list_thirumala_customers(self):
        user = auth_service.register_user(
            email="shop4@example.com",
            password="SecurePass1!",
            name="Shop Four",
        )
        client = self._auth(user)
        res = client.get("/api/v1/customers/")
        self.assertEqual(res.status_code, 200)
        results = res.data.get("results", res.data)
        names = [c.get("name") for c in results]
        self.assertNotIn("Thirumala Fleet Buyer", names)
        self.assertEqual(len(results), 0)

    def test_admin_still_sees_own_org_data(self):
        client = self._auth(self.admin)
        res = client.get("/api/v1/inventory/warehouses/")
        self.assertEqual(res.status_code, 200)
        results = res.data.get("results", res.data)
        names = [w.get("name") for w in results]
        self.assertIn("Thirumala Main", names)

        res = client.get("/api/v1/customers/")
        results = res.data.get("results", res.data)
        names = [c.get("name") for c in results]
        self.assertIn("Thirumala Fleet Buyer", names)

    def test_new_user_customer_lookup_does_not_match_other_org_phone(self):
        user = auth_service.register_user(
            email="shop5@example.com",
            password="SecurePass1!",
            name="Shop Five",
        )
        client = self._auth(user)
        res = client.get("/api/v1/customers/lookup/", {"phone": "9876543210"})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data.get("matched"))

    def test_register_api_returns_tokens_and_own_org(self):
        res = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "freshbiz@example.com",
                "password": "SecurePass1!",
                "name": "Fresh Biz",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn("access", res.data)
        self.assertEqual(res.data["user"]["email"], "freshbiz@example.com")
        self.assertEqual(res.data["user"]["role"], "ADMIN")
        self.assertIsNotNone(res.data["user"].get("organizationId"))
        self.assertNotEqual(
            str(res.data["user"]["organizationId"]),
            str(self.thirumala.id),
        )

    def test_new_user_pos_products_empty(self):
        user = auth_service.register_user(
            email="posshop@example.com",
            password="SecurePass1!",
            name="POS Shop",
        )
        client = self._auth(user)
        res = client.get("/api/v1/inventory/pos/products/")
        self.assertEqual(res.status_code, 200)
        results = res.data.get("results", [])
        self.assertEqual(len(results), 0)

    def test_new_user_stock_summary_is_empty(self):
        user = auth_service.register_user(
            email="emptybiz@example.com",
            password="SecurePass1!",
            name="Empty Biz",
        )
        client = self._auth(user)
        res = client.get("/api/v1/inventory/stock/summary/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.get("total_products"), 0)
        self.assertEqual(res.data.get("low_stock_count"), 0)
        self.assertEqual(res.data.get("out_of_stock_count"), 0)

    def test_signup_user_is_admin_of_own_org_not_staff(self):
        user = auth_service.register_user(
            email="owner@example.com",
            password="SecurePass1!",
            name="Biz Owner",
        )
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertIsNotNone(user.organization_id)
        # Thirumala admin stays on a different org
        self.assertNotEqual(user.organization_id, self.thirumala.id)

    def test_admin_created_staff_inherits_creator_org(self):
        client = self._auth(self.admin)
        res = client.post(
            "/api/v1/admin/users/",
            {
                "email": "cashier@example.com",
                "password": "SecurePass1!",
                "name": "Cashier",
                "role": "STAFF",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        staff = User.objects.get(email="cashier@example.com")
        self.assertEqual(staff.role, User.Role.STAFF)
        self.assertEqual(staff.organization_id, self.thirumala.id)

        staff_client = self._auth(staff)
        res = staff_client.get("/api/v1/inventory/stock/summary/")
        self.assertEqual(res.status_code, 200)
        # Staff of Thirumala sees Thirumala catalogue counts
        self.assertGreaterEqual(res.data.get("total_products"), 1)

    def test_login_admin_still_works(self):
        res = self.client.post(
            "/api/v1/auth/login/",
            {"email": "admin-isolation@example.com", "password": "Kushal@12"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["email"], "admin-isolation@example.com")
        self.assertEqual(
            str(res.data["user"]["organizationId"]),
            str(self.thirumala.id),
        )


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=True)
class SuperadminServiceToggleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(
            name="Toggle Shop",
            slug="toggle-shop",
        )
        self.owner = User.objects.create_user(
            username="toggle_owner",
            email="toggle-owner@example.com",
            password="SecurePass1!",
            role=User.Role.ADMIN,
            organization=self.org,
        )
        self.platform = User.objects.create_superuser(
            username="platform_sa",
            email="platform@example.com",
            password="SecurePass1!",
        )
        self.platform.organization = self.org
        self.platform.role = User.Role.ADMIN
        self.platform.save(update_fields=["organization", "role"])

    def _auth(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_non_superuser_forbidden_on_superadmin_list(self):
        client = self._auth(self.owner)
        res = client.get("/api/v1/superadmin/organizations/")
        self.assertEqual(res.status_code, 403)

    def test_superuser_lists_organizations(self):
        client = self._auth(self.platform)
        res = client.get("/api/v1/superadmin/organizations/")
        self.assertEqual(res.status_code, 200)
        ids = [o["id"] for o in res.data["results"]]
        self.assertIn(str(self.org.id), ids)

    def test_patch_customers_off_then_tenant_gets_403(self):
        client = self._auth(self.platform)
        res = client.patch(
            f"/api/v1/superadmin/organizations/{self.org.id}/services/",
            {"customers": False},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        enabled = res.data.get("enabledServices") or res.data.get("enabled_services")
        self.assertIsNotNone(enabled)
        self.assertFalse(enabled["customers"])

        tenant = self._auth(self.owner)
        res = tenant.get("/api/v1/customers/")
        self.assertEqual(res.status_code, 403)

    def test_signup_org_defaults_all_services_on(self):
        user = auth_service.register_user(
            email="defaults@example.com",
            password="SecurePass1!",
            name="Defaults Owner",
        )
        from users.organization import DEFAULT_ENABLED_SERVICES, get_enabled_services

        services = get_enabled_services(user.organization)
        for key, expected in DEFAULT_ENABLED_SERVICES.items():
            self.assertTrue(services[key], msg=f"{key} should default on")
            self.assertEqual(services[key], expected)

    def test_me_includes_is_superuser_and_enabled_services(self):
        client = self._auth(self.platform)
        res = client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get("isSuperuser"))
        self.assertIn("customers", res.data.get("enabledServices", {}))

    def test_superuser_lists_all_users(self):
        client = self._auth(self.platform)
        res = client.get("/api/v1/superadmin/users/")
        self.assertEqual(res.status_code, 200)
        emails = [u["email"] for u in res.data["results"]]
        self.assertIn(self.owner.email, emails)


@override_settings(AUTH_ALLOW_PUBLIC_SIGNUP=False)
class SignupDisabledTests(TestCase):
    def test_register_forbidden_when_disabled(self):
        client = APIClient()
        res = client.post(
            "/api/v1/auth/register/",
            {
                "email": "blocked@example.com",
                "password": "SecurePass1!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 403)
