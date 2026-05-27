"""
Custom DRF Renderers for Quake Inventory API.

Provides automatic snake_case to camelCase conversion for all API responses.
This ensures frontend receives consistent camelCase field names.
"""

import re
from rest_framework.renderers import JSONRenderer


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    if not name or '_' not in name:
        return name
    
    components = name.split('_')
    # First component stays lowercase, rest are title-cased
    return components[0] + ''.join(x.title() for x in components[1:])


def convert_keys_to_camel(data):
    """
    Recursively convert all dict keys from snake_case to camelCase.
    Handles nested dicts, lists, and primitive values.
    """
    if isinstance(data, dict):
        return {
            snake_to_camel(key): convert_keys_to_camel(value)
            for key, value in data.items()
        }
    elif isinstance(data, list):
        return [convert_keys_to_camel(item) for item in data]
    else:
        return data


class CamelCaseJSONRenderer(JSONRenderer):
    """
    JSON Renderer that converts all snake_case keys to camelCase.
    
    This renderer automatically transforms:
    - top-level keys
    - nested object keys  
    - keys within arrays
    
    Usage:
    - Set as default renderer in DRF settings
    - Frontend receives consistent camelCase responses
    
    Example:
        {"product_name": "T-Shirt", "cost_price": 499}
        becomes
        {"productName": "T-Shirt", "costPrice": 499}
    """
    
    def render(self, data, accepted_media_type=None, renderer_context=None):
        """Override render to convert keys to camelCase."""
        if data is not None:
            data = convert_keys_to_camel(data)
        return super().render(data, accepted_media_type, renderer_context)
