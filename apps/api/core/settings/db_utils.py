"""
Build Django PostgreSQL config from DATABASE_URL or legacy POSTGRES_* env vars.
"""

from __future__ import annotations

import os
from urllib.parse import parse_qs, unquote, urlparse


def get_postgres_database_config() -> dict:
    """
    Return DATABASES['default'] dict for PostgreSQL.

    Prefer DATABASE_URL (postgresql:// or postgres://).
    If unset, fall back to POSTGRES_DB, POSTGRES_USER, etc.
    """
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        return _config_from_database_url(url)
    return _config_from_postgres_env()


def _config_from_database_url(url: str) -> dict:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    parsed = urlparse(url)
    name = (parsed.path or "").lstrip("/") or ""
    user = unquote(parsed.username) if parsed.username else ""
    password = unquote(parsed.password) if parsed.password else ""
    host = parsed.hostname or "localhost"
    port = str(parsed.port or 5432)

    cfg: dict = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": name,
        "USER": user,
        "PASSWORD": password,
        "HOST": host,
        "PORT": port,
    }

    if parsed.query:
        qs = parse_qs(parsed.query, keep_blank_values=True)
        options = {}
        if "sslmode" in qs and qs["sslmode"][0]:
            options["sslmode"] = qs["sslmode"][0]
        if "connect_timeout" in qs and qs["connect_timeout"][0]:
            try:
                options["connect_timeout"] = int(qs["connect_timeout"][0])
            except ValueError:
                pass
        if options:
            cfg["OPTIONS"] = options

    return cfg


def _config_from_postgres_env() -> dict:
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "postgres"),
        "USER": os.getenv("POSTGRES_USER", "postgres"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "") or "",
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
