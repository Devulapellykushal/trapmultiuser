"""High-level auth / onboarding mail — uses pluggable adapter."""

from __future__ import annotations

import logging

from django.conf import settings

from .base import OutboundEmail
from .registry import get_email_adapter, smtp_configured

logger = logging.getLogger(__name__)


def _app_name() -> str:
    return getattr(settings, "APP_NAME", "Quake Inventory")


def send_password_reset_email(*, to_email: str, reset_url: str) -> None:
    app = _app_name()
    subject = f"Reset your {app} password"
    body = (
        f"You requested a password reset for {app}.\n\n"
        f"Open this link to choose a new password (expires in "
        f"{getattr(settings, 'PASSWORD_RESET_TIMEOUT_MINUTES', 60)} minutes):\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, ignore this email.\n"
    )
    html = f"""<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#111318;color:#f3eee4;padding:24px">
  <div style="max-width:480px;margin:0 auto">
    <h2 style="color:#c4a574;margin:0 0 16px">Reset your password</h2>
    <p style="color:#c5c0b5;line-height:1.5">You requested a password reset for <strong>{app}</strong>.</p>
    <p style="margin:24px 0"><a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#c4a574;color:#0c0d10;text-decoration:none;border-radius:8px;font-weight:600">Reset password</a></p>
    <p style="color:#8a867c;font-size:13px">Or copy this link:<br><span style="word-break:break-all">{reset_url}</span></p>
    <p style="color:#8a867c;font-size:13px;margin-top:24px">If you did not request this, you can ignore this email.</p>
  </div>
</body></html>"""
    get_email_adapter().send(
        OutboundEmail(to=to_email, subject=subject, body_text=body, body_html=html)
    )


def send_welcome_email(*, to_email: str, name: str) -> None:
    app = _app_name()
    dashboard = getattr(settings, "FRONTEND_URL", "").rstrip("/") + "/admin"
    support_email = getattr(settings, "SUPPORT_EMAIL", "") or ""
    support_phone = getattr(settings, "SUPPORT_PHONE", "") or ""
    greeting = name.strip() or "there"

    subject = f"Welcome to {app}"
    body = (
        f"Hi {greeting},\n\n"
        f"Your {app} account is ready.\n\n"
        f"Sign in: {dashboard}\n"
    )
    if support_email or support_phone:
        body += "\nNeed help?\n"
        if support_email:
            body += f"  Email: {support_email}\n"
        if support_phone:
            body += f"  Phone: {support_phone}\n"

    html = f"""<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#111318;color:#f3eee4;padding:24px">
  <div style="max-width:480px;margin:0 auto">
    <h2 style="color:#c4a574;margin:0 0 8px">Welcome to {app}</h2>
    <p style="color:#c5c0b5">Hi {greeting}, your account is ready.</p>
    <p style="margin:24px 0"><a href="{dashboard}" style="display:inline-block;padding:12px 24px;background:#c4a574;color:#0c0d10;text-decoration:none;border-radius:8px;font-weight:600">Open dashboard</a></p>
  </div>
</body></html>"""

    if not smtp_configured() and getattr(settings, "EMAIL_ADAPTER", "smtp") == "smtp":
        logger.info("welcome_email_skipped smtp_not_configured to=%s", to_email)
        return

    try:
        get_email_adapter().send(
            OutboundEmail(to=to_email, subject=subject, body_text=body, body_html=html)
        )
    except Exception:
        logger.exception("welcome_email_failed to=%s", to_email)
