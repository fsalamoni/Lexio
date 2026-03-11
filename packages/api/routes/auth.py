"""Lexio API — Authentication routes."""

import uuid
import secrets
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth import create_access_token, hash_password, verify_password
from packages.core.auth.dependencies import get_current_user
from packages.core.database.engine import async_session
from packages.core.database.models.user import User
from packages.core.database.models.organization import Organization
from packages.core.config import settings
from packages.api.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, ChangePasswordRequest
from packages.api.middleware.rate_limit import limiter

router = APIRouter()


async def get_db():
    async with async_session() as session:
        yield session


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email já cadastrado")

    # Get or create default organization
    org_stmt = select(Organization).where(Organization.slug == settings.default_org_slug)
    org_result = await db.execute(org_stmt)
    org = org_result.scalar_one_or_none()

    if not org:
        org = Organization(
            name=settings.default_org_name,
            slug=settings.default_org_slug,
            plan="free",
        )
        db.add(org)
        await db.flush()

    # Create user
    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        title=req.title,
        role="admin" if not (await db.execute(select(User).where(User.organization_id == org.id))).scalars().first() else "user",
        organization_id=org.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.organization_id, user.role)
    return TokenResponse(access_token=token, user_id=str(user.id), role=user.role, full_name=user.full_name or "")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == req.email, User.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "Credenciais inválidas")

    token = create_access_token(user.id, user.organization_id, user.role)
    return TokenResponse(access_token=token, user_id=str(user.id), role=user.role, full_name=user.full_name or "")


@router.get("/me")
async def me_endpoint(user: User = Depends(get_current_user)):
    """Return authenticated user profile."""
    return {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "title": user.title,
        "role": user.role,
        "organization_id": str(user.organization_id),
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ── Password Reset ────────────────────────────────────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Generate a password reset token. Token expires in 15 minutes.

    NOTE: In production, send the token via email. Currently it is returned
    in the response body for development/testing purposes. Set up an email
    service (e.g. Sendgrid) and remove 'dev_reset_token' from this response.
    """
    stmt = select(User).where(User.email == req.email, User.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Always return the same message to prevent user enumeration
    generic_msg = "Se o email estiver cadastrado, você receberá um link de redefinição em breve."

    if not user:
        return {"message": generic_msg}

    # Generate cryptographically secure token
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    await db.commit()

    import logging
    logging.getLogger("lexio.auth").info(
        f"Password reset requested for {user.email} — token: {token}"
    )

    return {
        "message": generic_msg,
        # TODO: Remove dev_reset_token in production and send via email instead
        "dev_reset_token": token,
    }


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password using a valid reset token."""
    if len(req.new_password) < 8:
        raise HTTPException(400, "A nova senha deve ter pelo menos 8 caracteres")

    stmt = select(User).where(User.reset_token == req.token, User.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(400, "Token inválido ou expirado")

    # Check expiry
    if user.reset_token_expires_at:
        expires = user.reset_token_expires_at
        # Make both timezone-aware for comparison
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(400, "Token inválido ou expirado")

    # Update password and clear token
    user.hashed_password = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    await db.commit()

    return {"message": "Senha redefinida com sucesso. Faça login com a nova senha."}


@router.get("/validate-reset-token/{token}")
async def validate_reset_token(token: str, db: AsyncSession = Depends(get_db)):
    """Check if a reset token is valid (not expired, not used)."""
    stmt = select(User).where(User.reset_token == token, User.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        return {"valid": False, "reason": "Token não encontrado"}

    if user.reset_token_expires_at:
        expires = user.reset_token_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            return {"valid": False, "reason": "Token expirado"}

    return {"valid": True, "email": user.email}


# ── Change Password ──────────────────────────────────────────────────────────


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the authenticated user's password."""
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one_or_none()
    if not db_user or not verify_password(req.current_password, db_user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Senha atual incorreta")
    if len(req.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A nova senha deve ter pelo menos 8 caracteres")
    db_user.hashed_password = hash_password(req.new_password)
    await db.commit()
    return {"message": "Senha alterada com sucesso"}
