"""SMTP adapter — stdlib smtplib with TLS/SSL (Brevo, Gmail, etc.)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from django.conf import settings

from .base import EmailAdapter, OutboundEmail

logger = logging.getLogger(__name__)


class SmtpEmailAdapter:
    def send(self, message: OutboundEmail) -> None:
        host = settings.EMAIL_HOST
        port = int(settings.EMAIL_PORT)
        user = settings.EMAIL_HOST_USER or None
        password = settings.EMAIL_HOST_PASSWORD or None
        use_tls = settings.EMAIL_USE_TLS
        from_email = settings.DEFAULT_FROM_EMAIL

        if not host or not from_email:
            raise RuntimeError("SMTP not configured (EMAIL_HOST and DEFAULT_FROM_EMAIL required)")

        msg = EmailMessage()
        msg["Subject"] = message.subject
        msg["From"] = from_email
        msg["To"] = message.to
        if message.body_html:
            msg.set_content(message.body_text)
            msg.add_alternative(message.body_html, subtype="html")
        else:
            msg.set_content(message.body_text)

        if use_tls and port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.ehlo()
                if use_tls:
                    smtp.starttls()
                    smtp.ehlo()
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)

        logger.info("Email sent to %s subject=%s", message.to, message.subject)
