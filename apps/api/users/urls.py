"""
Auth URL Configuration.
"""

from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    RefreshView,
    MeView,
    BusinessListCreateView,
    SwitchBusinessView,
    LeaveBusinessView,
    UserListCreateView,
    UserDetailView,
    RegisterView,
    PasswordForgotView,
    PasswordResetConfirmView,
    AuthCapabilitiesView,
)
from .superadmin_views import (
    SuperadminMeView,
    SuperadminOrganizationListView,
    SuperadminOrganizationDetailView,
    SuperadminOrganizationServicesView,
    SuperadminUserListView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('businesses/', BusinessListCreateView.as_view(), name='auth-businesses'),
    path(
        'businesses/switch/',
        SwitchBusinessView.as_view(),
        name='auth-businesses-switch',
    ),
    path(
        'businesses/leave/',
        LeaveBusinessView.as_view(),
        name='auth-businesses-leave',
    ),
    path('capabilities/', AuthCapabilitiesView.as_view(), name='auth-capabilities'),
    path('password/forgot/', PasswordForgotView.as_view(), name='auth-password-forgot'),
    path('password/reset/', PasswordResetConfirmView.as_view(), name='auth-password-reset'),
]

admin_urlpatterns = [
    path('users/', UserListCreateView.as_view(), name='admin-users-list'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='admin-users-detail'),
]

superadmin_urlpatterns = [
    path('me/', SuperadminMeView.as_view(), name='superadmin-me'),
    path(
        'organizations/',
        SuperadminOrganizationListView.as_view(),
        name='superadmin-organizations',
    ),
    path(
        'organizations/<uuid:pk>/',
        SuperadminOrganizationDetailView.as_view(),
        name='superadmin-organization-detail',
    ),
    path(
        'organizations/<uuid:pk>/services/',
        SuperadminOrganizationServicesView.as_view(),
        name='superadmin-organization-services',
    ),
    path('users/', SuperadminUserListView.as_view(), name='superadmin-users'),
]
