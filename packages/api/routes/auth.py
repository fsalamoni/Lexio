"""Lexio API — Authentication routes."""

import uuid

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
