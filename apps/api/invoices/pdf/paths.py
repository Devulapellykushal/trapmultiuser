"""Filesystem paths for invoice assets and local test outputs."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings


def repo_root() -> Path:
    """Monorepo root (…/trap). BASE_DIR is apps/api."""
    return Path(settings.BASE_DIR).resolve().parent.parent


def testinvoice_dir() -> Path:
    """
    ``trap/testinvoice/`` — sample PDFs from tests and ``generate_test_invoice_pdfs``.

    Created on demand; not used in production serving.
    """
    d = repo_root() / "testinvoice"
    d.mkdir(parents=True, exist_ok=True)
    return d
