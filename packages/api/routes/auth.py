"""Lexio API — Authentication routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth import create_access_token, hash_password, verify_password
from packages.core.database.engine import async_session
from packages.core.database.models.user import User
from packages.core.database.models.organization import Organization
from packages.core.config import settings
from packages.api.schemas.auth import RegisterRequest, LoginRequest, TokenResponse

router = APIRouter()


async def get_db():
    async with async_session() as session:
        yield session


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
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
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == req.email, User.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "Credenciais inválidas")

    token = create_access_token(user.id, user.organization_id, user.role)
    return TokenResponse(access_token=token, user_id=str(user.id), role=user.role, full_name=user.full_name or "")


@router.get("/me")
async def me_endpoint(
    db: AsyncSession = Depends(get_db),
):
    """Placeholder — use /auth/login to obtain a token and pass it in Authorization header."""
    return {"message": "Authenticated. Include Authorization: Bearer <token>"}
