"""
WSGI config for Quake Inventory API.
"""

import os

from django.core.wsgi import get_wsgi_application

# Dynamically set settings based on DJANGO_ENV
env = os.getenv('DJANGO_ENV', 'development')
settings_module = 'core.settings.production' if env == 'production' else 'core.settings.development'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', settings_module)

application = get_wsgi_application()
