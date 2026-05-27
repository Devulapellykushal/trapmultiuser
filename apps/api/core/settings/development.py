"""
Django development settings for Quake Inventory API.
"""

import os
from pathlib import Path

from .base import *
from .db_utils import get_postgres_database_config

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# Database configuration
# Uses PostgreSQL if available, falls back to SQLite for quick setup
USE_SQLITE = os.getenv('USE_SQLITE', 'false').lower() == 'true'

if USE_SQLITE:
    # SQLite for quick development without PostgreSQL
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': Path(__file__).resolve().parent.parent.parent / 'db.sqlite3',
        }
    }
else:
    # PostgreSQL: DATABASE_URL or legacy POSTGRES_* (see core/settings/db_utils.py)
    DATABASES = {'default': get_postgres_database_config()}

# CORS settings for local development
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]

CORS_ALLOW_CREDENTIALS = True

# Match production JSON shape (camelCase) for the web app; keep browsable API for debugging
REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [
    'core.renderers.CamelCaseJSONRenderer',
    'rest_framework.renderers.BrowsableAPIRenderer',
]

# Environment identifier
ENVIRONMENT = 'development'
