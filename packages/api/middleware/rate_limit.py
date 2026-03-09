"""Lexio API — Rate limiting configuration using slowapi."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Default limits per endpoint type:
# - auth endpoints: 10 requests/minute (brute-force protection)
# - document creation: 20 requests/minute
# - general API: 60 requests/minute
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
