"""
User Serializers for Quake Inventory System.
"""

from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from .models import User
from .organization import get_enabled_services


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user data in /auth/me/ response."""
    name = serializers.SerializerMethodField()
    organizationId = serializers.UUIDField(source='organization_id', read_only=True, allow_null=True)
    organizationName = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    isSuperuser = serializers.BooleanField(source='is_superuser', read_only=True)
    enabledServices = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'name',
            'role', 'is_active', 'date_joined', 'last_login',
            'organizationId', 'organizationName',
            'isSuperuser', 'enabledServices',
        ]
        read_only_fields = fields
    
    def get_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username

    def get_enabledServices(self, obj):
        return get_enabled_services(getattr(obj, "organization", None))


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users (admin only) — same organization."""
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = User
        fields = ['id', 'email', 'password', 'name', 'role']
    
    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()
    
    def create(self, validated_data):
        name = validated_data.pop('name', '')
        parts = name.split(' ', 1) if name else ['', '']
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ''
        
        email = validated_data['email']
        username = email.split('@')[0]
        base_username = username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1

        request = self.context.get('request')
        org = None
        if request and getattr(request.user, 'organization_id', None):
            org = request.user.organization
        
        user = User.objects.create_user(
            username=username,
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
            role=validated_data.get('role', User.Role.STAFF),
            organization=org,
        )
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating users (admin only)."""
    name = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'is_active', 'password']
        read_only_fields = ['id']
    
    def validate_email(self, value):
        user = self.instance
        if User.objects.filter(email=value).exclude(id=user.id).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()
    
    def update(self, instance, validated_data):
        name = validated_data.pop('name', None)
        password = validated_data.pop('password', None)
        
        if name is not None:
            parts = name.split(' ', 1)
            instance.first_name = parts[0]
            instance.last_name = parts[1] if len(parts) > 1 else ''
        
        if password:
            instance.set_password(password)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating own profile."""
    name = serializers.CharField(required=False, allow_blank=True)
    current_password = serializers.CharField(write_only=True, required=False)
    new_password = serializers.CharField(write_only=True, required=False, min_length=8)
    
    class Meta:
        model = User
        fields = ['email', 'name', 'current_password', 'new_password']
    
    def validate_email(self, value):
        user = self.instance
        if User.objects.filter(email=value).exclude(id=user.id).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()
    
    def validate(self, data):
        new_password = data.get('new_password')
        current_password = data.get('current_password')
        
        if new_password:
            if not current_password:
                raise serializers.ValidationError({
                    'current_password': 'Current password is required to set new password.'
                })
            if not self.instance.check_password(current_password):
                raise serializers.ValidationError({
                    'current_password': 'Current password is incorrect.'
                })
        
        return data
    
    def update(self, instance, validated_data):
        name = validated_data.pop('name', None)
        new_password = validated_data.pop('new_password', None)
        validated_data.pop('current_password', None)
        
        if name is not None:
            parts = name.split(' ', 1)
            instance.first_name = parts[0]
            instance.last_name = parts[1] if len(parts) > 1 else ''
        
        if 'email' in validated_data:
            instance.email = validated_data['email']
        
        if new_password:
            instance.set_password(new_password)
        
        instance.save()
        return instance


class LoginSerializer(serializers.Serializer):
    """Serializer for login request."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(
        choices=[User.Role.ADMIN, User.Role.STAFF],
        required=False,
        write_only=True,
        help_text=(
            "Optional legacy field. Ignored for authorization — each email has "
            "exactly one stored role. If sent, it must match User.role or login fails."
        ),
    )

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, data):
        email = data.get('email')
        password = data.get('password')
        requested_role = data.pop('role', None)

        if not email or not password:
            raise serializers.ValidationError("Email and password are required")

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid email or password")

        # Check password
        if not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password")

        # Check if user is active
        if not user.is_active:
            raise serializers.ValidationError("User account is disabled")

        if requested_role is not None and user.role != requested_role:
            label = "Administrator" if user.role == User.Role.ADMIN else "Staff"
            raise serializers.ValidationError(
                {
                    "role": (
                        f"This account is {user.role}. Choose “{label}” above, "
                        "or sign in with a different email."
                    )
                }
            )

        data['user'] = user
        return data


class TokenResponseSerializer(serializers.Serializer):
    """Serializer for login response with tokens."""
    
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()


class RefreshTokenSerializer(serializers.Serializer):
    """Serializer for token refresh request."""
    
    refresh = serializers.CharField()


class RegisterSerializer(serializers.Serializer):
    """Public signup — email + password."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(required=False, allow_blank=True, max_length=150)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        validate_password(value)
        return value


class PasswordForgotSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value
