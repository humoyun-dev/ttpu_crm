import uuid
from datetime import datetime, timezone as dt_timezone

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", User.Role.VIEWER)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        VIEWER = "viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    def __str__(self) -> str:
        return self.email

    class Meta:
        ordering = ("email",)


class RevokedToken(models.Model):
    class TokenType(models.TextChoices):
        ACCESS = "access", "Access"
        REFRESH = "refresh", "Refresh"

    jti = models.CharField(max_length=255, unique=True)
    token_type = models.CharField(max_length=32, choices=TokenType.choices)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["expires_at"]),
            models.Index(fields=["token_type"]),
        ]

    @classmethod
    def _exp_to_dt(cls, exp: int):
        return datetime.fromtimestamp(exp, tz=dt_timezone.utc)

    @classmethod
    def is_revoked(cls, token) -> bool:
        jti = token.get("jti")
        if not jti:
            return False
        return cls.objects.filter(jti=jti).exists()

    @classmethod
    def revoke(cls, token, token_type: str):
        jti = token.get("jti")
        exp = token.get("exp")
        if not jti or not exp:
            return
        cls.objects.get_or_create(
            jti=jti,
            defaults={
                "token_type": token_type,
                "expires_at": cls._exp_to_dt(exp),
            },
        )
