"""
Node Server — per-node MiA-RAG engine with SM4 encryption.

Contract (matches frontend central_server.py):
    POST /query   {"encrypted_query": "<SM4>"} → {"encrypted_result": "<SM4>"}
    GET  /health  → {"status": "ok", ...}

Usage:
    # Single node
    python node_server.py --port 8001

    # Multiple nodes (for testing federation)
    python node_server.py --port 8001
    python node_server.py --port 8002
    python node_server.py --port 8003

Env vars:
    DEEPSEEK_API_KEY         DeepSeek API key
    FEDERATION_SM4_KEY       SM4 shared key (16 bytes, same as central)
    MODEL_PATH               MiA-EMB model path
    BASE_MODEL_PATH          Base Qwen3-Embedding-8B path
"""

import argparse
import asyncio
import base64
import json
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

_project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(_project_root))

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("node_server")

# ── SM4 + SM3 Encryption ─────────────────────────────────────────

def _load_sm4_key() -> bytes:
    raw = os.getenv("FEDERATION_SM4_KEY", "").strip()
    if not raw:
        raise RuntimeError("FEDERATION_SM4_KEY not set")
    return raw.encode("utf-8")[:16].ljust(16, b'\x00')

try:
    from sm4 import SM4Key
    SM4_KEY = _load_sm4_key()
    _sm4 = SM4Key(SM4_KEY)
    SM4_AVAILABLE = True
except (ImportError, RuntimeError) as e:
    logger.warning(f"SM4 unavailable: {e} — running without encryption")
    SM4_AVAILABLE = False

# SM3 integrity (optional)
try:
    from crypto_utils import compute_integrity_tag, verify_integrity
    SM3_AVAILABLE = True
except ImportError:
    SM3_AVAILABLE = False


def sm4_encrypt(text: str) -> str:
    if not SM4_AVAILABLE:
        return base64.b64encode(text.encode()).decode()
    return base64.b64encode(_sm4.encrypt(text.encode("utf-8"), padding=True)).decode()


def sm4_decrypt(encrypted: str) -> str:
    if not SM4_AVAILABLE:
        return base64.b64decode(encrypted.encode()).decode()
    return _sm4.decrypt(base64.b64decode(encrypted.encode()), padding=True).decode("utf-8")


def sm4_encrypt_with_integrity(text: str) -> dict:
    """Encrypt + SM3 integrity tag."""
    encrypted = sm4_encrypt(text)
    tag = ""
    if SM3_AVAILABLE:
        tag = compute_integrity_tag(text, SM4_KEY)
    return {"encrypted": encrypted, "tag": tag}


def sm4_decrypt_with_integrity(payload: dict) -> str:
    """Decrypt + verify SM3 integrity tag."""
    encrypted = payload["encrypted"]
    tag = payload.get("tag", "")
    plaintext = sm4_decrypt(encrypted)
    if tag and SM3_AVAILABLE:
        if not verify_integrity(plaintext, tag, SM4_KEY):
            raise ValueError("SM3 integrity check failed")
    return plaintext


# ── Models ───────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    encrypted_query: str
    tag: str = ""  # Optional SM3 integrity tag


class QueryResponse(BaseModel):
    encrypted_result: str
    tag: str = ""  # Optional SM3 integrity tag


# ── RAG Engine ───────────────────────────────────────────────────

_rag = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _rag
    logger.info("Loading MiA-RAG engine...")
    from mia_emb import MiAConfig, MiARAG

    config = MiAConfig(
        model_path=os.getenv("MODEL_PATH", "MindscapeRAG/MiA-Emb-8B"),
        base_model_path=os.getenv("BASE_MODEL_PATH", "Qwen/Qwen3-Embedding-8B"),
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY", ""),
    )
    from api.database import Base, engine as db_engine
    Base.metadata.create_all(bind=db_engine)

    _rag = MiARAG(config=config, working_dir="./mia_rag_storage")
    await _rag.initialize(lang="zh")

    # Auto-load documents from DOC_DIR if set and mindscape not yet built
    doc_dir = os.getenv("DOC_DIR", "").strip()
    if doc_dir and not _rag.mindscape:
        docs = _load_documents(doc_dir)
        if docs:
            logger.info(f"Loading {len(docs)} documents from {doc_dir}...")
            await _rag.insert_documents(docs)

    # Make RAG available to API routers via deps module
    import api.deps as deps
    deps._rag_instance = _rag

    logger.info("Node server ready ✓")
    yield
    if _rag:
        await _rag.close()


def _load_documents(doc_dir: str) -> list[str]:
    """Load .txt documents with auto encoding detection."""
    docs = []
    doc_path = Path(doc_dir)
    if not doc_path.exists():
        return docs
    encodings = ["utf-8", "gbk", "gb2312", "gb18030", "latin-1"]
    for txt_file in sorted(doc_path.glob("*.txt")):
        for enc in encodings:
            try:
                content = txt_file.read_text(encoding=enc)
                if len(content.strip()) > 50:
                    docs.append(content)
                    logger.info(f"  ✓ {txt_file.name} ({len(content)} chars)")
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
    return docs


app = FastAPI(title="MiA-RAG Node Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ───────────────────────────────────────────────────────

@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest, request: Request):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())

    # Decrypt with optional SM3 integrity verification
    if req.tag and SM3_AVAILABLE:
        try:
            question = sm4_decrypt_with_integrity({"encrypted": req.encrypted_query, "tag": req.tag})
        except ValueError as e:
            logger.warning(f"[{request_id}] Integrity check failed: {e}")
            question = sm4_decrypt(req.encrypted_query)
    else:
        question = sm4_decrypt(req.encrypted_query)

    logger.info(f"[{request_id}] Query: {question[:60]}...")

    result = await _rag.query(question, use_dual_channel=True)

    payload = json.dumps({
        "answer": result["answer"],
        "confidence": result["metadata"].get("confidence"),
        "fine_entity_count": result["metadata"].get("fine_entity_count", 0),
        "coarse_community_count": result["metadata"].get("coarse_community_count", 0),
        "mindscape_used": result["metadata"].get("mindscape_used", False),
        "evidence": result.get("evidence", []),
        "parsed_query": result["metadata"].get("parsed_query", {}),
    }, ensure_ascii=False)

    # Encrypt with optional SM3 integrity tag
    if SM3_AVAILABLE:
        protected = sm4_encrypt_with_integrity(payload)
        encrypted = protected["encrypted"]
        tag = protected["tag"]
    else:
        encrypted = sm4_encrypt(payload)
        tag = ""

    logger.info(f"[{request_id}] Response: {len(encrypted)} chars encrypted")
    return QueryResponse(encrypted_result=encrypted, tag=tag)


@app.get("/health")
async def health(request: Request):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    return {
        "request_id": request_id,
        "status": "ok",
        "model_loaded": _rag is not None and _rag.mia_embedding is not None,
        "mindscape_ready": bool(_rag.mindscape) if _rag else False,
    }


# ── Keep old REST API for direct access (Swagger docs) ───────────

try:
    from api.routers import auth, query as api_query, documents, nodes
    app.include_router(auth.router)
    app.include_router(documents.router)
    app.include_router(api_query.router)
    app.include_router(nodes.router)
    logger.info("Direct REST API routes loaded")
except Exception as e:
    logger.warning(f"Direct REST API not available: {e}")


# ── Main ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="MiA-RAG Node Server")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Listen address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8001, help="Node port (default: 8001)")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
