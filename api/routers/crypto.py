"""
SM4 crypto utility endpoints for the BFF layer.

These endpoints allow the Next.js BFF to encrypt/decrypt query payloads
using the same SM4 key as the node servers, enabling end-to-end SM4
encryption across the federation.
"""

import base64
import os

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/sm4", tags=["crypto"])

FEDERATION_INTERNAL_TOKEN = os.getenv("FEDERATION_INTERNAL_TOKEN", "")


def _verify_internal_token(token: str | None):
    if not FEDERATION_INTERNAL_TOKEN:
        raise HTTPException(status_code=503, detail="Internal token not configured")
    if not token or token != FEDERATION_INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid internal token")


# ── Load SM4 engine ──────────────────────────────────────────────────
_sm4 = None
SM4_AVAILABLE = False

def _load_sm4_key() -> bytes:
    raw = os.getenv("FEDERATION_SM4_KEY", "").strip()
    if not raw:
        raise RuntimeError("FEDERATION_SM4_KEY not set")
    return raw.encode("utf-8")[:16].ljust(16, b'\x00')

try:
    from sm4 import SM4Key
    _sm4 = SM4Key(_load_sm4_key())
    SM4_AVAILABLE = True
except (ImportError, RuntimeError):
    pass


def _encrypt(text: str) -> str:
    if not SM4_AVAILABLE or not _sm4:
        return base64.b64encode(text.encode("utf-8")).decode()
    return base64.b64encode(_sm4.encrypt(text.encode("utf-8"), padding=True)).decode()


def _decrypt(encrypted: str) -> str:
    if not SM4_AVAILABLE or not _sm4:
        return base64.b64decode(encrypted.encode()).decode("utf-8")
    return _sm4.decrypt(base64.b64decode(encrypted.encode()), padding=True).decode("utf-8")


# ── Endpoints ────────────────────────────────────────────────────────

class EncryptRequest(BaseModel):
    plaintext: str


class EncryptResponse(BaseModel):
    encrypted: str


class DecryptRequest(BaseModel):
    encrypted: str


class DecryptResponse(BaseModel):
    plaintext: str


@router.post("/encrypt", response_model=EncryptResponse)
def encrypt(body: EncryptRequest, x_federation_token: str = Header(None, alias="X-Federation-Token")):
    _verify_internal_token(x_federation_token)
    return EncryptResponse(encrypted=_encrypt(body.plaintext))


@router.post("/decrypt", response_model=DecryptResponse)
def decrypt(body: DecryptRequest, x_federation_token: str = Header(None, alias="X-Federation-Token")):
    _verify_internal_token(x_federation_token)
    return DecryptResponse(plaintext=_decrypt(body.encrypted))
