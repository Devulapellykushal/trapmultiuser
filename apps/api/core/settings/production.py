"""
Django production settings for Quake Inventory API.
Optimized for Google Cloud Run + Cloud SQL.
"""

import os
import json

from .base import *
from .db_utils import get_postgres_database_config

# ========================================
# SECURITY SETTINGS
# ========================================

# SECURITY: debug must be False in production
DEBUG = False

# Hardened ALLOWED_HOSTS for Cloud Run
# 1. Allow any subdomain of .run.app (required for revision URLs)
# 2. Allow specific hosts from env var
ALLOWED_HOSTS = ['.run.app']
env_hosts = os.getenv('DJANGO_ALLOWED_HOSTS', '').split(',')
ALLOWED_HOSTS.extend([h.strip() for h in env_hosts if h.strip()])

# CSRF trusted origins (required for Cloud Run + Vercel)
# Explicitly trusting the frontend domain
CSRF_TRUSTED_ORIGINS = [
    "https://Quake-frontend.vercel.app",
]
env_origins = os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',')
CSRF_TRUSTED_ORIGINS.extend([o.strip() for o in env_origins if o.strip()])

# ========================================
# DATABASE - Supabase (PostgreSQL)
# ========================================

# Supabase connection options:
# 1. Direct connection (port 5432) - for migrations
# 2. Connection pooler (port 6543) - recommended for production

_pg = get_postgres_database_config()
_opts = dict(_pg.pop('OPTIONS', None) or {})
_opts.setdefault('sslmode', 'require')
ct = _opts.get('connect_timeout', 10)
_opts['connect_timeout'] = int(ct) if str(ct).isdigit() else 10

DATABASES = {
    'default': {
        **_pg,
        'CONN_MAX_AGE': 60,
        'OPTIONS': _opts,
    }
}

# ========================================
# CORS SETTINGS
# ========================================

# Explicit production CORS configuration
CORS_ALLOWED_ORIGINS = [
    "https://Quake-frontend.vercel.app",
]
env_cors = os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')
CORS_ALLOWED_ORIGINS.extend([o.strip() for o in env_cors if o.strip()])

CORS_ALLOW_CREDENTIALS = True

# Allowed headers for CORS requests (required for Authorization header)
CORS_ALLOW_HEADERS = [
    "authorization",
    "content-type",
    "accept",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# Allowed HTTP methods for CORS requests
CORS_ALLOW_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
]

# ========================================
# STATIC FILES (WhiteNoise)
# ========================================

# Insert WhiteNoise after SecurityMiddleware
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

# Add request logging middleware
MIDDLEWARE.append('core.logging_middleware.RequestLoggingMiddleware')

# WhiteNoise configuration
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ========================================
# HTTPS SECURITY
# ========================================

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Cloud Run terminates SSL, so we trust the proxy header
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

# Enable secure cookies
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True

# ========================================
# REST FRAMEWORK (Production)
# ========================================

# Only JSON renderer in production (no browsable API)
REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [
    'core.renderers.CamelCaseJSONRenderer',
]

# ========================================
# STRUCTURED LOGGING (JSON)
# ========================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'core.logging_formatter.JsonFormatter',
        },
        'standard': {
            'format': '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'gunicorn': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ========================================
# ENVIRONMENT IDENTIFIER
# ========================================

ENVIRONMENT = 'production'

