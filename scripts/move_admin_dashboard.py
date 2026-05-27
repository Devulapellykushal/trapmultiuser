#!/usr/bin/env python3
"""One-off: copy apps/web/app/(dashboard) -> apps/web/app/admin/(dashboard)."""
import os
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src = os.path.join(ROOT, "apps", "web", "app", "(dashboard)")
dst = os.path.join(ROOT, "apps", "web", "app", "admin", "(dashboard)")
os.makedirs(os.path.dirname(dst), exist_ok=True)
if not os.path.isdir(src):
    raise SystemExit(f"missing src: {src}")
if os.path.isdir(dst):
    shutil.rmtree(dst)
shutil.copytree(src, dst)
print("copied", src, "->", dst)
