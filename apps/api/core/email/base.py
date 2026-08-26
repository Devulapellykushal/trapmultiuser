"""Email adapter protocol — plug in SMTP, console, or future providers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class OutboundEmail:
    to: str
    subject: str
    body_text: str
    body_html: str | None = None


class EmailAdapter(Protocol):
    """Send one transactional message. Raises on hard failure."""

    def send(self, message: OutboundEmail) -> None: ...


def smtp_configured_from_settings() -> bool:
    from django.conf import settings

    return bool(getattr(settings, "EMAIL_HOST", "") and getattr(settings, "DEFAULT_FROM_EMAIL", ""))
