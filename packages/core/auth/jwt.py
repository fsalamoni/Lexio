"""Lexio Core — JWT encode/decode."""

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from packages.core.config import settings


def create_access_token(user_id: uuid.UUID, org_id: uuid.UUID, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    jwt_secret = settings.require_non_empty("jwt_secret", "JWT_SECRET")
    payload = {
        "sub": str(user_id),
        "org": str(org_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    jwt_secret = settings.require_non_empty("jwt_secret", "JWT_SECRET")
    return jwt.decode(token, jwt_secret, algorithms=[settings.jwt_algorithm])
