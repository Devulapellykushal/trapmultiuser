"""
Production-grade health check endpoint for Quake Inventory API.
"""

from datetime import datetime
from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def check_database_connection() -> str:
    """
    Check if the database connection is healthy.
    Returns 'connected' or 'disconnected'.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return "connected"
    except Exception:
        return "disconnected"


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Production-grade health check endpoint.
    
    Returns a JSON response with system status:
    - status: overall system status
    - service: service name
    - version: API version
    - environment: current environment (development/production)
    - database: database connection status
    - timestamp: ISO-8601 formatted timestamp
    """
    db_status = check_database_connection()
    overall_status = "ok" if db_status == "connected" else "degraded"
    
    response_data = {
        "status": overall_status,
        "service": "Quake Inventory API",
        "version": getattr(settings, 'API_VERSION', 'v1'),
        "environment": getattr(settings, 'ENVIRONMENT', 'development'),
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    return Response(response_data)
