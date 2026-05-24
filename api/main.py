"""
MiA-RAG API Server — FastAPI application entry point.

Usage:
    python -m api.main
    uvicorn api.main:app --host 0.0.0.0 --port 8000

Env vars:
    DEEPSEEK_API_KEY       DeepSeek API key for summarization
    JWT_SECRET_KEY         Secret key for JWT tokens
    MODEL_PATH             MiA-EMB model path (default: MindscapeRAG/MiA-Emb-8B)
    BASE_MODEL_PATH        Base Qwen3-Embedding-8B path
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

from api.database import Base, SessionLocal, engine
from api.deps import _rag_instance
from api.routers import auth, documents, nodes, query

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("api")

# ── Config ───────────────────────────────────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "MindscapeRAG/MiA-Emb-8B")
BASE_MODEL_PATH = os.getenv("BASE_MODEL_PATH", "Qwen/Qwen3-Embedding-8B")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
STATIC_DIR = Path("./uploads")


# ── Lifespan ─────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB + load model. Shutdown: cleanup."""
    logger.info("Initializing database...")
    Base.metadata.create_all(bind=engine)

    logger.info("Loading MiA-EMB model...")
    from mia_emb import MiAConfig, MiARAG

    config = MiAConfig(
        model_path=MODEL_PATH,
        base_model_path=BASE_MODEL_PATH,
        deepseek_api_key=DEEPSEEK_API_KEY,
    )

    rag = MiARAG(config=config, working_dir="./mia_rag_storage")
    await rag.initialize(lang="zh")

    # Load existing documents into LightRAG
    db = SessionLocal()
    try:
        from api.models import Document

        ready_docs = db.query(Document).filter(Document.status == "ready").all()
        if ready_docs:
            contents = [d.content for d in ready_docs if d.content]
            if contents:
                logger.info(f"Loading {len(contents)} documents into knowledge graph...")
                await rag.insert_documents(contents)
    finally:
        db.close()

    _rag_instance = rag  # noqa: F841 — stored in deps module
    # Actually set it on the module
    import api.deps as deps
    deps._rag_instance = rag

    logger.info("API server ready ✓")
    yield

    logger.info("Shutting down...")
    await rag.close()


# ── App ──────────────────────────────────────────────────────────

app = FastAPI(
    title="MiA-RAG API",
    description="Mixed Input Attention RAG — 动态图谱混合知识图谱协同推理系统",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(query.router)
app.include_router(nodes.router)

# Static files for uploaded documents
STATIC_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health", tags=["system"])
async def health():
    from mia_emb import _get_gpu_memory_gb

    rag = None
    try:
        from api.deps import get_rag
        rag = get_rag()
    except Exception:
        pass

    return {
        "status": "ok",
        "model_loaded": rag is not None and rag.mia_embedding is not None,
        "mindscape_ready": bool(rag.mindscape) if rag else False,
        "document_count": 0,  # TODO: count from DB
        "gpu_available": _get_gpu_memory_gb() > 0,
    }
