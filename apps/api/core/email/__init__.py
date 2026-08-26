"""
Pluggable transactional email — swap adapters via EMAIL_ADAPTER env.

Adapters: smtp (default), console (local dev logs only).
"""

from .registry import get_email_adapter, smtp_configured
from .transactional import (
    send_password_reset_email,
    send_welcome_email,
)

__all__ = [
    "get_email_adapter",
    "smtp_configured",
    "send_password_reset_email",
    "send_welcome_email",
]
