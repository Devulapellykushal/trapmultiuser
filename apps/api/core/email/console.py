"""Console adapter — logs emails; no SMTP required (local dev)."""

from __future__ import annotations

import logging

from .base import EmailAdapter, OutboundEmail

logger = logging.getLogger(__name__)


class ConsoleEmailAdapter:
    def send(self, message: OutboundEmail) -> None:
        logger.info(
            "EMAIL [console] to=%s subject=%s\n%s",
            message.to,
            message.subject,
            message.body_text,
        )
