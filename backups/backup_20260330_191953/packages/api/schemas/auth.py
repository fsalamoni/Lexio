"""Lexio API — Auth schemas."""

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    title: str | None = None  # e.g. "Promotor de Justiça"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    full_name: str = ""


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
