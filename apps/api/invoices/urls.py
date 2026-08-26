"""
Invoice URL Configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    GenerateInvoiceView,
    InvoiceViewSet,
    DiscountSettingsView,
    BusinessSetupView,
    POSDiscountOptionsView,
)

router = DefaultRouter()
router.register(r'', InvoiceViewSet, basename='invoice')

urlpatterns = [
    # Settings endpoints
    path('settings/discounts/', DiscountSettingsView.as_view(), name='discount-settings'),
    path('settings/business-setup/', BusinessSetupView.as_view(), name='business-setup'),
    path('settings/pos-discounts/', POSDiscountOptionsView.as_view(), name='pos-discount-options'),
    
    # Generate invoice
    path('generate/', GenerateInvoiceView.as_view(), name='generate-invoice'),
    
    # Invoice list and details (read-only)
    path('', include(router.urls)),
]

