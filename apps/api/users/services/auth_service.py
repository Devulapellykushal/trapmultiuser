"""
Auth business logic — signup, password reset, welcome mail, org tenancy.
"""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.email import send_password_reset_email, send_welcome_email, smtp_configured
from core.email.registry import get_email_adapter

from ..models import Organization, PasswordResetToken, User
from ..organization import create_organization_for_signup, ensure_membership

logger = logging.getLogger(__name__)


def _unique_username_from_email(email: str) -> str:
    base = email.split("@")[0][:30] or "user"
    username = base
    counter = 1
    while User.objects.filter(username=username).exists():
        username = f"{base}{counter}"
        counter += 1
    return username


@transaction.atomic
def register_user(
    *,
    email: str,
    password: str,
    name: str = "",
    industry: str | None = None,
) -> User:
    """
    Public signup: create a NEW organization + ADMIN user.

    Critical safety: never attach a public signup to an existing business
    (e.g. Thirumala). New accounts start with an empty workspace.
    """
    if not settings.AUTH_ALLOW_PUBLIC_SIGNUP:
        raise ValueError("Public signup is disabled")

    email = email.strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        raise ValueError("A user with this email already exists")

    parts = name.split(" ", 1) if name.strip() else ["", ""]
    org = create_organization_for_signup(
        email=email,
        name=name.strip(),
        industry=industry,
    )

    user = User.objects.create_user(
        username=_unique_username_from_email(email),
        email=email,
        password=password,
        first_name=parts[0],
        last_name=parts[1] if len(parts) > 1 else "",
        role=User.Role.ADMIN,
        organization=org,
    )
    ensure_membership(user, org, role=User.Role.ADMIN)
    maybe_send_welcome(user)
    return user


def maybe_send_welcome(user: User) -> None:
    if user.welcome_email_sent_at is not None:
        return
    if not smtp_configured() and getattr(settings, "EMAIL_ADAPTER", "smtp") == "smtp":
        return

    user.welcome_email_sent_at = timezone.now()
    user.save(update_fields=["welcome_email_sent_at"])

    name = f"{user.first_name} {user.last_name}".strip() or user.username
    try:
        send_welcome_email(to_email=user.email, name=name)
    except Exception:
        logger.exception("welcome_email_failed user_id=%s", user.id)


def request_password_reset(*, email: str) -> dict:
    email = email.strip().lower()
    result: dict = {
        "message": (
            "If an account exists for that email, we sent a password reset link."
        ),
    }

    try:
        user = User.objects.get(email__iexact=email, is_active=True)
    except User.DoesNotExist:
        return result

    token_str = secrets.token_urlsafe(32)
    expires = timezone.now() + timedelta(minutes=settings.PASSWORD_RESET_TIMEOUT_MINUTES)
    PasswordResetToken.objects.create(
        user=user,
        token=token_str,
        expires_at=expires,
    )

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token_str}"

    if smtp_configured() or getattr(settings, "EMAIL_ADAPTER", "smtp") == "console":
        try:
            get_email_adapter()
            send_password_reset_email(to_email=user.email, reset_url=reset_url)
        except Exception as exc:
            logger.exception("password_reset_email_failed user_id=%s", user.id)
            if not settings.DEBUG and not settings.AUTH_DEV_RETURN_RESET_TOKEN:
                raise RuntimeError("Could not send reset email") from exc
            if settings.AUTH_DEV_RETURN_RESET_TOKEN:
                result["dev_token"] = token_str
                result["dev_reset_url"] = reset_url
    elif settings.AUTH_DEV_RETURN_RESET_TOKEN:
        logger.warning("password_reset_dev_token user_id=%s token=%s", user.id, token_str)
        result["dev_token"] = token_str
        result["dev_reset_url"] = reset_url

    return result


def confirm_password_reset(*, token: str, new_password: str) -> User:
    token = (token or "").strip()
    if not token:
        raise ValueError("Reset token is required")

    try:
        row = PasswordResetToken.objects.select_related("user").get(token=token)
    except PasswordResetToken.DoesNotExist:
        raise ValueError("Invalid or expired reset link")

    if row.used_at is not None:
        raise ValueError("This reset link was already used")

    if row.expires_at < timezone.now():
        raise ValueError("This reset link has expired")

    user = row.user
    if not user.is_active:
        raise ValueError("User account is disabled")

    user.set_password(new_password)
    user.save(update_fields=["password"])

    row.used_at = timezone.now()
    row.save(update_fields=["used_at"])

    maybe_send_welcome(user)
    return user


def auth_capabilities() -> dict:
    adapter = getattr(settings, "EMAIL_ADAPTER", "smtp")
    mail_ready = smtp_configured() or adapter == "console"
    return {
        "public_signup_enabled": settings.AUTH_ALLOW_PUBLIC_SIGNUP,
        "smtp_ready": mail_ready,
        "password_reset_enabled": mail_ready or settings.AUTH_DEV_RETURN_RESET_TOKEN,
        "email_adapter": adapter,
    }


def ensure_default_organization() -> Organization:
    """Legacy / seed: single shared org for existing Thirumala data."""
    org, _ = Organization.objects.get_or_create(
        slug="thirumala-wheels",
        defaults={"name": "Thirumala Wheels"},
    )
    return org
