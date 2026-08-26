"""
Django base settings for Quake Inventory API.
Shared configuration between development and production.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-change-me-in-production')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
    
    # Local apps
    'users',
    'inventory',
    'customers',
    'sales',
    'invoices',
    'analytics',
    'reports',
    'notifications',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization — Indian tyre shops: calendar day = IST business day
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# User-uploaded files (warehouse seller image, invoice PDFs, barcodes, etc.)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom User Model
AUTH_USER_MODEL = 'users.User'

# Django REST Framework configuration
REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_RENDERER_CLASSES': [
        'core.renderers.CamelCaseJSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'EXCEPTION_HANDLER': 'core.exception_handler.custom_exception_handler',
}

# drf-spectacular settings for API documentation
SPECTACULAR_SETTINGS = {
    'TITLE': 'Quake Inventory API',
    'DESCRIPTION': 'Enterprise-grade inventory management system for luxury apparel',
    'VERSION': 'v1',
    'SERVE_INCLUDE_SCHEMA': False,
    'SCHEMA_PATH_PREFIX': '/api/',
    'COMPONENT_SPLIT_REQUEST': True,
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': False,
    },
}

# JWT Configuration (ready for future auth implementation)
from datetime import timedelta

SIMPLE_JWT = {
    # Short-lived: proves the request is fresh; client refreshes silently on 401 / near expiry
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('JWT_ACCESS_TOKEN_LIFETIME', 60))),
    # Absolute session ceiling (default 7 days). After this, user must sign in again.
    'REFRESH_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('JWT_REFRESH_TOKEN_LIFETIME', 10080))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# API Version
API_VERSION = 'v1'

# Email Configuration
# Can be overridden in database NotificationSettings or via environment variables
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('SMTP_HOST', '')
EMAIL_PORT = int(os.getenv('SMTP_PORT', 587))
EMAIL_HOST_USER = os.getenv('SMTP_USERNAME', '')
EMAIL_HOST_PASSWORD = os.getenv('SMTP_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('SMTP_USE_TLS', 'True').lower() == 'true'
EMAIL_USE_SSL = os.getenv('SMTP_USE_SSL', 'False').lower() == 'true'
DEFAULT_FROM_EMAIL = os.getenv('SMTP_FROM_EMAIL', 'noreply@Quake-inventory.com')

# App branding & auth mail
APP_NAME = os.getenv('APP_NAME', 'Quake Inventory')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
SUPPORT_EMAIL = os.getenv('SUPPORT_EMAIL', '')
SUPPORT_PHONE = os.getenv('SUPPORT_PHONE', '')

# Pluggable mail: smtp | console (console logs only — no delivery)
EMAIL_ADAPTER = os.getenv('EMAIL_ADAPTER', 'smtp')

# Public signup + password reset
AUTH_ALLOW_PUBLIC_SIGNUP = os.getenv('AUTH_ALLOW_PUBLIC_SIGNUP', 'true').lower() == 'true'
AUTH_DEV_RETURN_RESET_TOKEN = os.getenv('AUTH_DEV_RETURN_RESET_TOKEN', 'false').lower() == 'true'
PASSWORD_RESET_TIMEOUT_MINUTES = int(os.getenv('PASSWORD_RESET_TIMEOUT_MINUTES', '60'))
