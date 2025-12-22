from dataclasses import dataclass
from typing import Annotated

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, status

from src.config import get_settings

settings = get_settings()

# OAuth client
oauth = OAuth()


def setup_oauth():
    """Configure OAuth client for Authentik."""
    if settings.authentik_issuer and settings.authentik_client_id:
        oauth.register(
            name="authentik",
            client_id=settings.authentik_client_id,
            client_secret=settings.authentik_client_secret,
            server_metadata_url=f"{settings.authentik_issuer}/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile groups"},
        )


@dataclass
class UserInfo:
    """User information from authentication."""
    email: str
    name: str
    groups: list[str]
    is_admin: bool


def get_user_from_session(request: Request) -> UserInfo | None:
    """Extract user info from session."""
    user_data = request.session.get("user")
    if not user_data:
        return None

    groups = user_data.get("groups", [])
    is_admin = settings.authentik_admin_group in groups

    return UserInfo(
        email=user_data.get("email", ""),
        name=user_data.get("name", ""),
        groups=groups,
        is_admin=is_admin,
    )


def get_dev_user() -> UserInfo:
    """Get development mode user."""
    is_admin = settings.dev_user_role == "admin"
    return UserInfo(
        email="dev@example.com",
        name="Development User",
        groups=["dev"],
        is_admin=is_admin,
    )


async def require_auth(request: Request) -> UserInfo:
    """Dependency requiring authentication."""
    # Development mode bypass
    if settings.dev_mode:
        return get_dev_user()

    user = get_user_from_session(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    # Check if user has access
    if settings.authentik_access_group not in user.groups and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return user


async def require_admin(request: Request) -> UserInfo:
    """Dependency requiring admin access."""
    # Development mode bypass
    if settings.dev_mode:
        user = get_dev_user()
        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        return user

    user = get_user_from_session(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return user
