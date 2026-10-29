"""Verify Managed Neon Auth identities before accessing any user's data.

Passwords and long-lived sessions stay with the identity provider. The API only
accepts short-lived Ed25519 JWTs from this project's fixed JWKS and issuer.
"""
from functools import lru_cache
import os
from urllib.parse import urlsplit

from fastapi import Header, HTTPException
import jwt
from jwt import PyJWKClient, PyJWKClientConnectionError, PyJWTError


def auth_url():
    return os.environ.get("NEON_AUTH_BASE_URL", "").strip().rstrip("/")


@lru_cache(maxsize=4)
def jwks_client(url):
    return PyJWKClient(url, cache_keys=True, lifespan=300, timeout=10)


def require_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Войди в свой аккаунт.", headers={"WWW-Authenticate": "Bearer"})
    base = auth_url()
    jwks = os.environ.get("NEON_AUTH_JWKS_URL", "").strip()
    if not base or not jwks:
        raise HTTPException(503, "Вход временно недоступен. Повтори попытку позже.")
    token = authorization[7:].strip()
    if not token or len(token) > 8192:
        raise HTTPException(401, "Сессия завершилась. Войди снова.")
    issuer_parts = urlsplit(base)
    issuer = f"{issuer_parts.scheme}://{issuer_parts.netloc}"
    try:
        key = jwks_client(jwks).get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token, key, algorithms=["EdDSA"], issuer=issuer,
            options={"require": ["sub", "exp", "iat", "iss"], "verify_aud": False},
            leeway=5,
        )
        owner = payload["sub"]
        if not isinstance(owner, str) or not owner or len(owner) > 64:
            raise ValueError("Invalid subject")
        if payload.get("is_anonymous") or payload.get("role") == "anon":
            raise ValueError("An account is required")
        return owner
    except PyJWKClientConnectionError:
        raise HTTPException(503, "Не удалось проверить сессию. Повтори попытку.") from None
    except (PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "Сессия завершилась. Войди снова.", headers={"WWW-Authenticate": "Bearer"}) from None
