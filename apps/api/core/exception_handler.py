"""
Custom Exception Handler for Quake Inventory API.

Provides standardized error response format for all API errors.
All errors return a consistent structure for frontend consumption.
"""

from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import (
    APIException,
    ValidationError as DRFValidationError,
    NotFound,
    PermissionDenied,
    AuthenticationFailed,
    NotAuthenticated,
)


# Error code mapping for common exceptions
ERROR_CODES = {
    'NotFound': 'NOT_FOUND',
    'PermissionDenied': 'PERMISSION_DENIED',
    'AuthenticationFailed': 'AUTHENTICATION_FAILED',
    'NotAuthenticated': 'NOT_AUTHENTICATED',
    'ValidationError': 'VALIDATION_ERROR',
    'MethodNotAllowed': 'METHOD_NOT_ALLOWED',
    'Throttled': 'RATE_LIMITED',
}


def get_error_code(exception):
    """Get standardized error code from exception type."""
    exception_name = exception.__class__.__name__
    return ERROR_CODES.get(exception_name, 'SERVER_ERROR')


def format_validation_errors(detail):
    """
    Format DRF validation errors into standardized structure.
    Returns first field error with field name.
    """
    if isinstance(detail, list):
        # List of errors for same field
        return {
            'message': str(detail[0]),
            'field': None,
        }
    elif isinstance(detail, dict):
        # Multiple field errors - return first one
        for field, errors in detail.items():
            if isinstance(errors, list) and len(errors) > 0:
                return {
                    'message': str(errors[0]),
                    'field': field if field != 'non_field_errors' else None,
                }
            elif isinstance(errors, str):
                return {
                    'message': errors,
                    'field': field if field != 'non_field_errors' else None,
                }
        return {
            'message': 'Validation failed',
            'field': None,
        }
    else:
        return {
            'message': str(detail),
            'field': None,
        }


def custom_exception_handler(exc, context):
    """
    Custom exception handler returning unified error format.
    
    Response format:
    {
        "error": {
            "code": "INSUFFICIENT_STOCK",
            "message": "Only 2 items left",
            "field": "quantity"  // optional
        }
    }
    
    This ensures frontend always receives errors in the same structure.
    """
    
    # Call DRF's default exception handler first
    response = drf_exception_handler(exc, context)
    
    if response is not None:
        # Handle DRF exceptions
        if isinstance(exc, DRFValidationError):
            error_info = format_validation_errors(response.data)
            
            # Check for custom error codes in validation errors
            if isinstance(response.data, dict):
                if 'code' in response.data:
                    error_code = response.data['code']
                elif 'error' in response.data:
                    error_code = response.data.get('error', 'VALIDATION_ERROR')
                else:
                    error_code = 'VALIDATION_ERROR'
            else:
                error_code = 'VALIDATION_ERROR'
            
            error_response = {
                'error': {
                    'code': error_code,
                    'message': error_info['message'],
                }
            }
            if error_info['field']:
                error_response['error']['field'] = error_info['field']
            
            response.data = error_response
        
        elif isinstance(exc, NotFound):
            response.data = {
                'error': {
                    'code': 'NOT_FOUND',
                    'message': str(exc.detail) if hasattr(exc, 'detail') else 'Resource not found',
                }
            }
        
        elif isinstance(exc, (PermissionDenied, AuthenticationFailed, NotAuthenticated)):
            error_code = get_error_code(exc)
            response.data = {
                'error': {
                    'code': error_code,
                    'message': str(exc.detail) if hasattr(exc, 'detail') else 'Access denied',
                }
            }
        
        elif isinstance(exc, APIException):
            error_code = get_error_code(exc)
            response.data = {
                'error': {
                    'code': error_code,
                    'message': str(exc.detail) if hasattr(exc, 'detail') else str(exc),
                }
            }
    
    else:
        # Handle non-DRF exceptions (500 errors)
        import logging
        logger = logging.getLogger(__name__)
        logger.exception(f"Unhandled exception: {exc}")
        
        response = Response({
            'error': {
                'code': 'SERVER_ERROR',
                'message': 'An unexpected error occurred. Please try again later.',
            }
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return response
