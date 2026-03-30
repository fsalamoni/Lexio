"""Lexio API — Tenant (organization) scoping middleware."""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("lexio.middleware.tenant")


class TenantMiddleware(BaseHTTPMiddleware):
    """Extracts organization context from JWT for multi-tenant queries.

    The org_id is already embedded in the JWT token and available via
    get_current_user dependency. This middleware adds it to request state
    for convenience in routes that don't use the auth dependency.
    """

    async def dispatch(self, request: Request, call_next):
        # The actual org scoping happens via get_current_user dependency
        # which reads org_id from JWT. This middleware is a placeholder
        # for additional tenant-level logic (rate limiting, feature flags, etc.)
        response = await call_next(request)
        return response
