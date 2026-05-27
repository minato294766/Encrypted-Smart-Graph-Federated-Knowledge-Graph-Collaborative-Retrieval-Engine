"""
Node Server — per-node MiA-RAG engine with SM4 encryption.

Contract (matches frontend central_server.py):
    POST /query   {"encrypted_query": "<SM4>"} → {"encrypted_result": "<SM4>"}
    GET  /health  → {"status": "ok", ...}

Usage:
    # Single node
    python node_server.py

    # Multiple nodes (for testing federation)
    python node_server.py --port 6006
    python node_server.py --port 6007
    python node_server.py --port 6008

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

# Suppress LightRAG's verbose internal logging on startup
logging.getLogger("lightrag").setLevel(logging.WARNING)

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


# ── RAG Manager (per-user isolation) ──────────────────────────────

_rag_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _rag_manager
    logger.info("Loading MiA-RAG engine (per-user isolation)...")
    from mia_emb import MiAConfig
    from mia_emb.rag_manager import MiARAGManager

    config = MiAConfig(
        model_path=os.getenv("MODEL_PATH", "MindscapeRAG/MiA-Emb-8B"),
        base_model_path=os.getenv("BASE_MODEL_PATH", "Qwen/Qwen3-Embedding-8B"),
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY", ""),
    )
    from api.database import Base, SessionLocal, engine as db_engine
    Base.metadata.create_all(bind=db_engine)

    # 自动迁移：给旧表添加缺失的列
    import sqlite3
    db_path = "./mia_rag_storage/api.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        if "status" not in columns:
            logger.info("Migrating: adding 'status' column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN status VARCHAR(32) DEFAULT 'pending'")
            conn.commit()
            logger.info("Migration complete ✓")

        cursor.execute("PRAGMA table_info(documents)")
        doc_columns = [row[1] for row in cursor.fetchall()]
        if "user_id" not in doc_columns:
            logger.info("Migrating: adding 'user_id' column to documents table...")
            cursor.execute("ALTER TABLE documents ADD COLUMN user_id INTEGER REFERENCES users(id)")
            cursor.execute("UPDATE documents SET user_id = 1 WHERE user_id IS NULL")
            conn.commit()
            logger.info("Migration complete ✓")
        conn.close()
    except Exception as e:
        logger.warning(f"Migration check: {e}")

    # 创建默认管理员账号（如果不存在）
    db = SessionLocal()
    try:
        from api.models import User
        from api.deps import hash_password

        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            logger.info("Creating default admin user (admin/admin123456)...")
            admin = User(
                username="admin",
                password_hash=hash_password("admin123456"),
                email="admin@mia-rag.local",
                role="admin",
                status="approved",
            )
            db.add(admin)
            db.commit()
            logger.info("Default admin user created ✓")
        elif admin_user.status != "approved":
            admin_user.status = "approved"
            admin_user.role = "admin"
            db.commit()
            logger.info("Admin user status updated ✓")
    finally:
        db.close()

    _rag_manager = MiARAGManager(config=config, base_dir="./mia_rag_storage")
    await _rag_manager.initialize(lang="zh")

    # Auto-load documents from DOC_DIR into admin user's RAG
    doc_dir = os.getenv("DOC_DIR", "").strip()
    if doc_dir:
        docs = _load_documents(doc_dir)
        if docs:
            logger.info(f"Loading {len(docs)} documents from {doc_dir} into admin RAG...")
            admin_rag = await _rag_manager.get_user_rag(1)  # admin = user 1
            await admin_rag.insert_documents(docs)

    # Load documents from database (per-user)
    db2 = SessionLocal()
    try:
        from api.models import Document, ClusterFile, Cluster
        from collections import defaultdict

        # Group documents by user_id
        ready_docs = db2.query(Document).filter(Document.status == "ready").all()
        user_docs: dict[int, list[str]] = defaultdict(list)
        for d in ready_docs:
            if d.content and d.user_id:
                user_docs[d.user_id].append(d.content)

        # Group cluster files by owner
        cluster_files = (
            db2.query(ClusterFile)
            .join(Cluster)
            .filter(ClusterFile.status == "ready")
            .all()
        )
        for cf in cluster_files:
            if cf.content:
                cluster = db2.query(Cluster).filter(Cluster.id == cf.cluster_id).first()
                if cluster and cluster.user_id:
                    user_docs[cluster.user_id].append(cf.content)

        # Load into per-user RAG instances
        total_loaded = 0
        for user_id, contents in user_docs.items():
            if contents:
                logger.info(f"Loading {len(contents)} documents for user {user_id}...")
                user_rag = await _rag_manager.get_user_rag(user_id)
                await user_rag.insert_documents(contents)
                total_loaded += len(contents)

        if total_loaded:
            logger.info(f"Loaded {total_loaded} total documents across {len(user_docs)} users")
        else:
            logger.info("No documents found in database")
    finally:
        db2.close()

    # Make manager available to API routers via deps module
    import api.deps as deps
    deps._rag_manager = _rag_manager

    logger.info("Node server ready ✓")
    yield
    if _rag_manager:
        await _rag_manager.close()


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

    # Federation node queries across all users' knowledge graphs
    result = await _rag_manager.query_global(question)

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
        "model_loaded": _rag_manager is not None and _rag_manager._embedding is not None,
        "user_count": len(_rag_manager._user_rags) if _rag_manager else 0,
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
    parser.add_argument("--port", type=int, default=6006, help="Node port (default: 6006)")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
