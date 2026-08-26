"""
Auth Views for Quake Inventory System.

JWT-based authentication endpoints.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from drf_spectacular.utils import extend_schema

from .models import User
from .permissions import IsAdmin
from .serializers import (
    UserSerializer,
    LoginSerializer,
    TokenResponseSerializer,
    RefreshTokenSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    PasswordForgotSerializer,
    PasswordResetConfirmSerializer,
)
from .services import auth_service


class LoginView(APIView):
    """
    Authenticate user and return JWT tokens.
    
    POST /api/v1/auth/login/
    """
    permission_classes = [AllowAny]
    
    @extend_schema(
        summary="Login",
        description="Authenticate with email and password to receive JWT tokens.",
        request=LoginSerializer,
        responses={
            200: TokenResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['Authentication']
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = serializer.validated_data['user']
        
        auth_service.maybe_send_welcome(user)
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        }, status=status.HTTP_200_OK)


class RegisterView(APIView):
    """Public signup with email and password."""

    permission_classes = [AllowAny]

    @extend_schema(
        summary="Register",
        description="Create an account with email and password (when public signup is enabled).",
        request=RegisterSerializer,
        responses={201: TokenResponseSerializer},
        tags=['Authentication'],
    )
    def post(self, request):
        if not auth_service.auth_capabilities()['public_signup_enabled']:
            return Response(
                {'detail': 'Public signup is disabled.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = auth_service.register_user(
                email=data['email'],
                password=data['password'],
                name=data.get('name', ''),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PasswordForgotView(APIView):
    """Send password reset link to email."""

    permission_classes = [AllowAny]

    @extend_schema(
        summary="Forgot password",
        description="Request a password reset link by email.",
        request=PasswordForgotSerializer,
        tags=['Authentication'],
    )
    def post(self, request):
        serializer = PasswordForgotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        caps = auth_service.auth_capabilities()
        if not caps['password_reset_enabled']:
            return Response(
                {'detail': 'Password reset is not available. Contact your administrator.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            result = auth_service.request_password_reset(email=serializer.validated_data['email'])
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(result, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """Set new password using token from email link."""

    permission_classes = [AllowAny]

    @extend_schema(
        summary="Reset password",
        description="Confirm password reset with token from email.",
        request=PasswordResetConfirmSerializer,
        responses={200: TokenResponseSerializer},
        tags=['Authentication'],
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = auth_service.confirm_password_reset(
                token=data['token'],
                new_password=data['new_password'],
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class AuthCapabilitiesView(APIView):
    """Feature flags for login UI (signup, SMTP, reset)."""

    permission_classes = [AllowAny]

    @extend_schema(
        summary="Auth capabilities",
        tags=['Authentication'],
    )
    def get(self, request):
        return Response(auth_service.auth_capabilities(), status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    Logout user by blacklisting refresh token.
    
    POST /api/v1/auth/logout/
    """
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Logout",
        description="Invalidate the refresh token.",
        request=RefreshTokenSerializer,
        responses={
            200: {"type": "object", "properties": {"message": {"type": "string"}}},
            400: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['Authentication']
    )
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)
        except TokenError:
            return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)


class RefreshView(APIView):
    """
    Refresh access token using refresh token.
    
    POST /api/v1/auth/refresh/
    """
    permission_classes = [AllowAny]
    
    @extend_schema(
        summary="Refresh Token",
        description="Get new access token using refresh token.",
        request=RefreshTokenSerializer,
        responses={
            200: {"type": "object", "properties": {"access": {"type": "string"}}},
            401: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['Authentication']
    )
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                return Response({
                    'error': {
                        'code': 'INVALID_TOKEN',
                        'message': 'Refresh token is required'
                    }
                }, status=status.HTTP_400_BAD_REQUEST)
            
            token = RefreshToken(refresh_token)
            
            return Response({
                'access': str(token.access_token)
            }, status=status.HTTP_200_OK)
        except TokenError as e:
            return Response({
                'error': {
                    'code': 'INVALID_TOKEN',
                    'message': 'Invalid or expired refresh token'
                }
            }, status=status.HTTP_401_UNAUTHORIZED)


class MeView(APIView):
    """
    Get or update current authenticated user info.
    
    GET /api/v1/auth/me/
    PATCH /api/v1/auth/me/
    """
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Current User",
        description="Get the currently authenticated user's profile.",
        responses={
            200: UserSerializer,
            401: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['Authentication']
    )
    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
    
    @extend_schema(
        summary="Update Profile",
        description="Update the currently authenticated user's profile.",
        request=ProfileUpdateSerializer,
        responses={
            200: UserSerializer,
            400: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['Authentication']
    )
    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class UserListCreateView(APIView):
    """
    List all users or create a new user (admin only).
    
    GET /api/v1/admin/users/
    POST /api/v1/admin/users/
    """
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="List Users",
        description="Get all users in the system (admin only).",
        responses={200: UserSerializer(many=True)},
        tags=['User Management']
    )
    def get(self, request):
        qs = User.objects.all().order_by('-date_joined')
        org_id = getattr(request.user, 'organization_id', None)
        if org_id:
            qs = qs.filter(organization_id=org_id)
        else:
            qs = qs.none()
        return Response(UserSerializer(qs, many=True).data, status=status.HTTP_200_OK)
    
    @extend_schema(
        summary="Create User",
        description="Create a new user account (admin only).",
        request=UserCreateSerializer,
        responses={
            201: UserSerializer,
            400: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['User Management']
    )
    def post(self, request):
        serializer = UserCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    """
    Get, update, or delete a specific user (admin only).
    
    GET /api/v1/admin/users/{id}/
    PATCH /api/v1/admin/users/{id}/
    DELETE /api/v1/admin/users/{id}/
    """
    permission_classes = [IsAdmin]
    
    def get_object(self, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None
        org_id = getattr(self.request.user, 'organization_id', None)
        if org_id and user.organization_id != org_id:
            return None
        return user
    
    @extend_schema(
        summary="Get User",
        description="Get a specific user's details (admin only).",
        responses={
            200: UserSerializer,
            404: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['User Management']
    )
    def get(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({
                'error': {'code': 'NOT_FOUND', 'message': 'User not found'}
            }, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
    
    @extend_schema(
        summary="Update User",
        description="Update a user's details (admin only).",
        request=UserUpdateSerializer,
        responses={
            200: UserSerializer,
            400: {"type": "object", "properties": {"error": {"type": "object"}}},
            404: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['User Management']
    )
    def patch(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({
                'error': {'code': 'NOT_FOUND', 'message': 'User not found'}
            }, status=status.HTTP_404_NOT_FOUND)
        
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
    
    @extend_schema(
        summary="Delete User",
        description="Delete a user (admin only). Cannot delete yourself.",
        responses={
            204: None,
            400: {"type": "object", "properties": {"error": {"type": "object"}}},
            404: {"type": "object", "properties": {"error": {"type": "object"}}}
        },
        tags=['User Management']
    )
    def delete(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({
                'error': {'code': 'NOT_FOUND', 'message': 'User not found'}
            }, status=status.HTTP_404_NOT_FOUND)
        
        if user.id == request.user.id:
            return Response({
                'error': {'code': 'INVALID_OPERATION', 'message': 'Cannot delete yourself'}
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
