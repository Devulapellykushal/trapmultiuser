"""Unique usernames for Django tests (avoids collisions under SQLite + APITestCase)."""
import uuid


def unique_username(prefix: str = "user") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"
