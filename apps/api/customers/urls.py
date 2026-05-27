from django.urls import path

from .views import CustomerViewSet

urlpatterns = [
    path(
        '',
        CustomerViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='customer-list',
    ),
    path(
        '<uuid:pk>/',
        CustomerViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy',
        }),
        name='customer-detail',
    ),
]
