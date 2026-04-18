"""Lexio Core — RBAC permissions."""

from enum import Enum

from fastapi import HTTPException, status


class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"
    VIEWER = "viewer"


# Role hierarchy: admin > user > viewer
ROLE_HIERARCHY = {
    Role.ADMIN: 3,
    Role.USER: 2,
    Role.VIEWER: 1,
}


def require_role(minimum_role: Role):
    """Dependency factory: ensures user has at least the given role level."""
    def checker(user):
        user_level = ROLE_HIERARCHY.get(Role(user.role), 0)
        required_level = ROLE_HIERARCHY.get(minimum_role, 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requer permissão de nível '{minimum_role.value}' ou superior",
            )
        return user
    return checker
