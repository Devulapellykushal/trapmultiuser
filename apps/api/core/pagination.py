"""
Standard Pagination for Quake Inventory System.

Provides a consistent pagination response format across all list endpoints.

Response Format:
{
    "results": [...],
    "meta": {
        "page": 1,
        "pageSize": 20,
        "total": 1247,
        "hasNext": true,
        "hasPrev": false
    }
}
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """
    Standard pagination with consistent meta format.
    
    Query params:
        - page: Page number (default: 1)
        - page_size: Items per page (default: 20, max: 100)
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
    
    def get_paginated_response(self, data):
        return Response({
            'results': data,
            'meta': {
                'page': self.page.number,
                'pageSize': self.get_page_size(self.request),
                'total': self.page.paginator.count,
                'hasNext': self.page.has_next(),
                'hasPrev': self.page.has_previous(),
            }
        })
    
    def get_paginated_response_schema(self, schema):
        return {
            'type': 'object',
            'properties': {
                'results': schema,
                'meta': {
                    'type': 'object',
                    'properties': {
                        'page': {'type': 'integer', 'example': 1},
                        'pageSize': {'type': 'integer', 'example': 20},
                        'total': {'type': 'integer', 'example': 100},
                        'hasNext': {'type': 'boolean', 'example': True},
                        'hasPrev': {'type': 'boolean', 'example': False},
                    }
                }
            }
        }
