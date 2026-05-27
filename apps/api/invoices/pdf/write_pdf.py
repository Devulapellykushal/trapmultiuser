"""
Write invoice PDF to an arbitrary path (same engine selection as production).

Used by ``testinvoice`` dumps and tests — not for normal ``media/invoices`` flow.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def write_invoice_pdf_best_effort(invoice, pdf_path: str) -> None:
    """
    Prefer WeasyPrint retail layout; on failure use ReportLab.

    Raises the last exception if both backends fail.
    """
    abspath = os.path.abspath(pdf_path)
    parent = os.path.dirname(abspath)
    if parent:
        os.makedirs(parent, exist_ok=True)

    last_exc: Exception | None = None
    try:
        from .generator import generate_pdf_weasyprint

        generate_pdf_weasyprint(invoice, pdf_path)
        if _is_valid_pdf(pdf_path):
            return
    except Exception as exc:
        last_exc = exc
        msg = str(exc).lower()
        if isinstance(exc, ModuleNotFoundError):
            logger.info("WeasyPrint missing; ReportLab for %s", pdf_path)
        elif isinstance(exc, OSError) and (
            "dlopen" in msg or "cannot load library" in msg or "libgobject" in msg or "libpango" in msg
        ):
            logger.warning("WeasyPrint libs missing; ReportLab for %s", pdf_path)
        else:
            logger.exception("WeasyPrint failed for %s", pdf_path)

    if os.path.exists(pdf_path):
        try:
            os.remove(pdf_path)
        except OSError:
            pass

    try:
        from .generator import generate_pdf_simple

        generate_pdf_simple(invoice, pdf_path)
        if _is_valid_pdf(pdf_path):
            return
    except Exception as exc:
        last_exc = exc
        logger.exception("ReportLab failed for %s", pdf_path)

    if last_exc:
        raise last_exc from None
    raise RuntimeError(f"Could not produce PDF at {pdf_path}")


def _is_valid_pdf(path: str) -> bool:
    try:
        if not os.path.isfile(path) or os.path.getsize(path) < 64:
            return False
        with open(path, "rb") as fh:
            return fh.read(5) == b"%PDF-"
    except OSError:
        return False


def is_valid_invoice_pdf(path: str) -> bool:
    """True if path looks like a real PDF on disk (used by API download + services)."""
    return _is_valid_pdf(path)
