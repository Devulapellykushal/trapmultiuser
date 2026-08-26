"""
Customer CRM helpers — contact-unique identity, sale sync, segment counts.

Identity rule:
- Same mobile (digits) OR same email → same customer (map / merge)
- Name alone does not create a duplicate when phone or email already exists
- Name-only buyers (no phone/email) match by name among contact-less rows
"""
from __future__ import annotations

import re
from datetime import timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from django.db.models import Count, Max, Q, Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import Customer


def digits_only(phone: str) -> str:
    return re.sub(r"\D", "", (phone or "").strip())


def phone_key(phone: str) -> str:
    """Canonical phone key for uniqueness (last 10 digits when possible)."""
    d = digits_only(phone)
    if not d or len(d) < 8:
        return ""
    return d[-10:] if len(d) >= 10 else d


def phone_lookup_variants(phone: str) -> list[str]:
    d = digits_only(phone)
    if not d:
        return []
    variants = {d}
    if len(d) > 10:
        variants.add(d[-10:])
    if len(d) == 10:
        variants.add("91" + d)
        variants.add("0" + d)
    return [v for v in variants if len(v) >= 8]


def phones_match(a: str, b: str) -> bool:
    ka, kb = phone_key(a), phone_key(b)
    if not ka or not kb:
        return False
    return ka == kb


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip())


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def sales_q_for_customer(customer: Customer) -> Q:
    """FK link, or orphan invoice with matching phone or email."""
    q = Q(customer_id=customer.id)
    variants = phone_lookup_variants(customer.phone)
    email = normalize_email(customer.email)

    if variants:
        phone_q = Q()
        for v in variants:
            needle = v[-10:] if len(v) >= 10 else v
            phone_q |= Q(customer_mobile__icontains=needle)
        q |= Q(customer_id__isnull=True) & phone_q

    if email:
        q |= Q(customer_id__isnull=True) & Q(customer_email__iexact=email)

    return q


def _find_by_phone(phone: str, *, organization_id=None) -> Optional[Customer]:
    key = phone_key(phone)
    if not key:
        return None
    qs = Customer.objects.filter(is_active=True).exclude(phone="")
    if organization_id is not None:
        qs = qs.filter(organization_id=organization_id)
    for c in qs.order_by("-updated_at"):
        if phone_key(c.phone) == key:
            return c
    return None


def _find_by_email(email: str, *, organization_id=None) -> Optional[Customer]:
    em = normalize_email(email)
    if not em:
        return None
    qs = Customer.objects.filter(is_active=True, email__iexact=em)
    if organization_id is not None:
        qs = qs.filter(organization_id=organization_id)
    return qs.order_by("-updated_at").first()


def _find_by_name_only(name: str, *, organization_id=None) -> Optional[Customer]:
    """Match name only among buyers with no phone and no email."""
    name_n = normalize_name(name)
    if not name_n:
        return None
    qs = (
        Customer.objects.filter(is_active=True, name__iexact=name_n)
        .filter(Q(phone="") | Q(phone__isnull=True))
        .filter(Q(email="") | Q(email__isnull=True))
    )
    if organization_id is not None:
        qs = qs.filter(organization_id=organization_id)
    return qs.order_by("-updated_at").first()


def _merge_customer_into(winner: Customer, loser: Customer) -> None:
    """Point loser's sales at winner, copy missing fields, deactivate loser."""
    from sales.models import Sale

    if winner.id == loser.id:
        return

    Sale.objects.filter(customer_id=loser.id).update(customer_id=winner.id)

    dirty = False
    if not normalize_name(winner.name) and normalize_name(loser.name):
        winner.name = loser.name
        dirty = True
    if not winner.phone and loser.phone:
        winner.phone = loser.phone
        dirty = True
    if not winner.email and loser.email:
        winner.email = loser.email
        dirty = True
    if not winner.address and loser.address:
        winner.address = loser.address
        dirty = True
    if not winner.gstin and loser.gstin:
        winner.gstin = loser.gstin
        dirty = True
    note_bits = []
    if loser.notes:
        note_bits.append(loser.notes.strip())
    alt = normalize_name(loser.name)
    if alt and alt.lower() != normalize_name(winner.name).lower():
        note_bits.append(f"Also billed as: {alt}")
    if note_bits:
        extra = "\n".join(note_bits)
        winner.notes = (
            f"{winner.notes.strip()}\n{extra}".strip()
            if winner.notes
            else extra
        )
        dirty = True
    if dirty:
        winner.save(
            update_fields=[
                "name",
                "phone",
                "email",
                "address",
                "gstin",
                "notes",
                "updated_at",
            ]
        )

    loser.is_active = False
    loser.notes = (
        f"{(loser.notes or '').strip()}\nMerged into {winner.id}".strip()
    )
    loser.save(update_fields=["is_active", "notes", "updated_at"])


def find_existing_customer(
    *,
    phone: str = "",
    email: str = "",
    name: str = "",
    organization_id=None,
) -> Optional[Customer]:
    """
    Unique on mobile OR email within an organization.
    If both keys hit different rows, merge into phone match.
    """
    by_phone = _find_by_phone(phone, organization_id=organization_id) if phone else None
    by_email = _find_by_email(email, organization_id=organization_id) if email else None

    if by_phone and by_email and by_phone.id != by_email.id:
        _merge_customer_into(by_phone, by_email)
        return by_phone
    if by_phone:
        return by_phone
    if by_email:
        return by_email
    if name and not phone and not email:
        return _find_by_name_only(name, organization_id=organization_id)
    return None


def upsert_from_checkout(
    *,
    name: str = "",
    phone: str = "",
    email: str = "",
    address: str = "",
    organization_id=None,
) -> Optional[Customer]:
    """
    Find or create by unique mobile/email (or name-only when no contacts).
    Always scoped to organization when provided.
    """
    phone = (phone or "").strip()[:20]
    name = normalize_name(name)
    email = (email or "").strip()
    address = (address or "").strip()

    if not phone and not email and not name:
        return None

    existing = find_existing_customer(
        phone=phone,
        email=email,
        name=name,
        organization_id=organization_id,
    )

    if existing:
        dirty = False
        # Prefer latest non-empty checkout name on the unique contact
        if name and normalize_name(existing.name) != name:
            if not normalize_name(existing.name):
                existing.name = name
                dirty = True
            elif name.lower() != normalize_name(existing.name).lower():
                # Keep primary name; record alias once
                alias = f"Also billed as: {name}"
                if alias not in (existing.notes or ""):
                    existing.notes = (
                        f"{(existing.notes or '').strip()}\n{alias}".strip()
                    )
                    dirty = True
        if email and not existing.email:
            existing.email = email
            dirty = True
        if address and not existing.address:
            existing.address = address
            dirty = True
        if phone and not existing.phone:
            existing.phone = phone
            dirty = True
        elif phone and existing.phone and not phones_match(existing.phone, phone):
            # same email path brought us here with a new phone — keep first phone
            pass
        if dirty:
            existing.save(
                update_fields=[
                    "name",
                    "email",
                    "address",
                    "phone",
                    "notes",
                    "updated_at",
                ]
            )
        return existing

    display_name = name or phone or email or "Customer"
    return Customer.objects.create(
        name=display_name,
        phone=phone,
        email=email,
        address=address,
        is_active=True,
        organization_id=organization_id,
    )


def merge_duplicate_customers() -> int:
    """
    Collapse active customers that share a phone key or email into one row.
    Returns number of deactivated duplicates.
    """
    customers = list(Customer.objects.filter(is_active=True))
    if not customers:
        return 0

    parent: dict[UUID, UUID] = {c.id: c.id for c in customers}

    def find(x: UUID) -> UUID:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: UUID, b: UUID) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    by_phone: dict[str, UUID] = {}
    by_email: dict[str, UUID] = {}
    for c in customers:
        pk = phone_key(c.phone)
        if pk:
            if pk in by_phone:
                union(c.id, by_phone[pk])
            else:
                by_phone[pk] = c.id
        em = normalize_email(c.email)
        if em:
            if em in by_email:
                union(c.id, by_email[em])
            else:
                by_email[em] = c.id

    groups: dict[UUID, list[Customer]] = {}
    for c in customers:
        groups.setdefault(find(c.id), []).append(c)

    merged = 0
    for members in groups.values():
        if len(members) < 2:
            continue
        winner = max(
            members,
            key=lambda c: (
                c.sales.count(),
                1 if c.phone else 0,
                1 if c.email else 0,
                -c.created_at.timestamp(),
            ),
        )
        for loser in members:
            if loser.id == winner.id:
                continue
            _merge_customer_into(winner, loser)
            merged += 1
    return merged


def annotate_customer_queryset(qs):
    return qs.annotate(
        sale_count=Count("sales", distinct=True),
        last_sale_at=Max("sales__created_at"),
        total_revenue=Coalesce(
            Sum("sales__total"),
            Value(Decimal("0.00")),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
        credit_outstanding=Coalesce(
            Sum(
                "sales__credit_balance",
                filter=Q(sales__credit_status__in=["PENDING", "PARTIAL"]),
            ),
            Value(Decimal("0.00")),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
    )


def compute_purchase_stats(customer: Customer) -> dict:
    from sales.models import Sale

    qs = Sale.objects.filter(sales_q_for_customer(customer)).filter(
        status=Sale.Status.COMPLETED
    )
    agg = qs.aggregate(
        sale_count=Count("id"),
        last_sale_at=Max("created_at"),
        total_revenue=Coalesce(
            Sum("total"),
            Value(Decimal("0.00")),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
        credit_outstanding=Coalesce(
            Sum(
                "credit_balance",
                filter=Q(credit_status__in=["PENDING", "PARTIAL"]),
            ),
            Value(Decimal("0.00")),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
    )
    return {
        "sale_count": int(agg["sale_count"] or 0),
        "last_sale_at": agg["last_sale_at"],
        "total_revenue": agg["total_revenue"] or Decimal("0.00"),
        "credit_outstanding": agg["credit_outstanding"] or Decimal("0.00"),
    }


def list_customer_sales(customer: Customer, limit: int = 50):
    from sales.models import Sale

    return (
        Sale.objects.filter(sales_q_for_customer(customer))
        .filter(status=Sale.Status.COMPLETED)
        .select_related("warehouse", "store")
        .order_by("-created_at")[:limit]
    )


def link_matching_sales(customer: Customer) -> int:
    """Attach orphan sales that match this customer's phone or email."""
    from sales.models import Sale

    variants = phone_lookup_variants(customer.phone)
    email = normalize_email(customer.email)
    clauses: list[Q] = []
    if variants:
        phone_q = Q()
        for v in variants:
            needle = v[-10:] if len(v) >= 10 else v
            phone_q |= Q(customer_mobile__icontains=needle)
        clauses.append(phone_q)
    if email:
        clauses.append(Q(customer_email__iexact=email))
    if not clauses:
        return 0
    match = clauses[0]
    for c in clauses[1:]:
        match |= c
    return int(
        Sale.objects.filter(customer_id__isnull=True)
        .filter(match)
        .update(customer_id=customer.id)
    )


def sync_customers_from_sales() -> dict:
    """
    Dedupe by phone/email, then pull every invoice buyer into Customers.
    """
    from sales.models import Sale

    duplicates_merged = merge_duplicate_customers()

    created = 0
    linked = 0
    skipped = 0
    seen_before = set(
        Customer.objects.filter(is_active=True).values_list("id", flat=True)
    )

    sales = (
        Sale.objects.filter(status=Sale.Status.COMPLETED)
        .order_by("created_at")
        .iterator()
    )
    for sale in sales:
        name = normalize_name(sale.customer_name or "")
        phone = (sale.customer_mobile or "").strip()
        email = (sale.customer_email or "").strip()
        if not name and not phone and not email:
            skipped += 1
            continue

        customer = upsert_from_checkout(
            name=name,
            phone=phone,
            email=email,
            address=(sale.customer_address or "").strip(),
        )
        if customer is None:
            skipped += 1
            continue

        if customer.id not in seen_before:
            created += 1
            seen_before.add(customer.id)

        if sale.customer_id != customer.id:
            Sale.objects.filter(pk=sale.pk).update(customer_id=customer.id)
            linked += 1

    # Second pass: collapse any new collisions
    duplicates_merged += merge_duplicate_customers()

    return {
        "customers_created": created,
        "sales_linked": linked,
        "sales_skipped": skipped,
        "duplicates_merged": duplicates_merged,
        "total_customers": Customer.objects.filter(is_active=True).count(),
    }


def segment_counts(*, organization_id=None) -> dict:
    from sales.models import Sale

    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    lapse_before = now - timedelta(days=90)

    active_qs = Customer.objects.filter(is_active=True)
    if organization_id is not None:
        active_qs = active_qs.filter(organization_id=organization_id)
    all_active = active_qs.count()

    credit_sales = Sale.objects.filter(
        credit_status__in=["PENDING", "PARTIAL"],
        credit_balance__gt=0,
    ).exclude(customer_id__isnull=True)
    if organization_id is not None:
        credit_sales = credit_sales.filter(organization_id=organization_id)
    credit_ids = credit_sales.values_list("customer_id", flat=True).distinct()
    credit_outstanding = active_qs.filter(id__in=credit_ids).count()

    sales_base = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        customer_id__isnull=False,
    )
    if organization_id is not None:
        sales_base = sales_base.filter(organization_id=organization_id)

    repeat_ids = (
        sales_base.values("customer_id")
        .annotate(c=Count("id"))
        .filter(c__gte=2)
        .values_list("customer_id", flat=True)
    )
    repeat_buyers = active_qs.filter(id__in=repeat_ids).count()

    fleet_gstin = active_qs.exclude(gstin="").exclude(gstin__isnull=True).count()

    with_sales = (
        sales_base.values("customer_id")
        .annotate(last=Max("created_at"))
        .filter(last__lt=lapse_before)
        .values_list("customer_id", flat=True)
    )
    lapsed_90d = active_qs.filter(id__in=with_sales).count()

    new_this_month = active_qs.filter(created_at__gte=month_start).count()

    return {
        "all_active": all_active,
        "credit_outstanding": credit_outstanding,
        "repeat_buyers": repeat_buyers,
        "fleet_gstin": fleet_gstin,
        "lapsed_90d": lapsed_90d,
        "new_this_month": new_this_month,
    }


def hub_summary(*, organization_id=None) -> dict:
    from sales.models import Sale

    active_qs = Customer.objects.filter(is_active=True)
    if organization_id is not None:
        active_qs = active_qs.filter(organization_id=organization_id)
    active = active_qs.count()
    total = active
    sales_qs = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        customer_id__isnull=False,
    )
    if organization_id is not None:
        sales_qs = sales_qs.filter(organization_id=organization_id)
    revenue = (
        sales_qs.aggregate(
            t=Coalesce(
                Sum("total"),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )["t"]
        or Decimal("0.00")
    )
    credit_qs = Sale.objects.filter(
        credit_status__in=["PENDING", "PARTIAL"],
        credit_balance__gt=0,
        customer_id__isnull=False,
    )
    if organization_id is not None:
        credit_qs = credit_qs.filter(organization_id=organization_id)
    credit = (
        credit_qs.aggregate(
            t=Coalesce(
                Sum("credit_balance"),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )["t"]
        or Decimal("0.00")
    )
    return {
        "active_customers": active,
        "total_customers": total,
        "linked_revenue": revenue,
        "credit_outstanding": credit,
        "segments": segment_counts(organization_id=organization_id),
    }
