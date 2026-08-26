"""Load email adapter from Django settings (EMAIL_ADAPTER)."""

from __future__ import annotations

from django.conf import settings

from .base import EmailAdapter, smtp_configured_from_settings
from .console import ConsoleEmailAdapter
from .smtp import SmtpEmailAdapter

_ADAPTERS: dict[str, type] = {
    "smtp": SmtpEmailAdapter,
    "console": ConsoleEmailAdapter,
}


def smtp_configured() -> bool:
    return smtp_configured_from_settings()


def get_email_adapter() -> EmailAdapter:
    name = getattr(settings, "EMAIL_ADAPTER", "smtp").lower().strip()
    cls = _ADAPTERS.get(name)
    if cls is None:
        raise ValueError(f"Unknown EMAIL_ADAPTER: {name!r}. Choose: {', '.join(_ADAPTERS)}")
    return cls()
