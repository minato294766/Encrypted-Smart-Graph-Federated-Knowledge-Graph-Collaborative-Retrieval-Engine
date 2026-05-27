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
from api.routers import admin, auth, chat_history, clusters, crypto, documents, macro, nodes, query

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
            # 将已有文档归属到 admin 用户 (id=1)
            cursor.execute("UPDATE documents SET user_id = 1 WHERE user_id IS NULL")
            conn.commit()
            logger.info("Migration complete ✓")

        # Migrate query_logs.question to nullable for audit compliance mode
        cursor.execute("PRAGMA table_info(query_logs)")
        ql_columns = [row[1] for row in cursor.fetchall()]
        if "question" in ql_columns:
            # Check if question has NOT NULL constraint by inspecting the schema
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='query_logs'")
            row = cursor.fetchone()
            if row and row[0] and "question" in row[0] and "NOT NULL" in row[0].split("question")[1].split(",")[0]:
                logger.info("Migrating: making query_logs.question nullable for audit compliance...")
                # SQLite doesn't support ALTER COLUMN; recreate the table
                old_sql = row[0]
                new_sql = old_sql.replace("question TEXT NOT NULL", "question TEXT")
                if new_sql != old_sql:
                    cursor.execute("ALTER TABLE query_logs RENAME TO query_logs_old")
                    cursor.execute(new_sql)
                    cursor.execute("INSERT INTO query_logs SELECT * FROM query_logs_old")
                    cursor.execute("DROP TABLE query_logs_old")
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

    logger.info("Loading MiA-EMB model (shared across all users)...")
    from mia_emb import MiAConfig
    from mia_emb.rag_manager import MiARAGManager

    config = MiAConfig(
        model_path=MODEL_PATH,
        base_model_path=BASE_MODEL_PATH,
        deepseek_api_key=DEEPSEEK_API_KEY,
    )

    manager = MiARAGManager(config=config, base_dir="./mia_rag_storage")
    await manager.initialize(lang="zh")

    # Load existing documents into per-user RAG instances
    db = SessionLocal()
    try:
        from api.models import Document, ClusterFile, Cluster, User
        from collections import defaultdict

        # Group documents by user_id
        ready_docs = db.query(Document).filter(Document.status == "ready").all()
        user_docs: dict[int, list[str]] = defaultdict(list)
        for d in ready_docs:
            if d.content and d.user_id:
                user_docs[d.user_id].append(d.content)

        # Group cluster files by owner (via Cluster.user_id)
        cluster_files = (
            db.query(ClusterFile)
            .join(Cluster)
            .filter(ClusterFile.status == "ready")
            .all()
        )
        for cf in cluster_files:
            if cf.content:
                # Get the cluster owner
                cluster = db.query(Cluster).filter(Cluster.id == cf.cluster_id).first()
                if cluster and cluster.user_id:
                    user_docs[cluster.user_id].append(cf.content)

        # Load documents into each user's RAG
        total_loaded = 0
        for user_id, contents in user_docs.items():
            if contents:
                logger.info(f"Loading {len(contents)} documents for user {user_id}...")
                user_rag = await manager.get_user_rag(user_id)
                await user_rag.insert_documents(contents)
                total_loaded += len(contents)

        if total_loaded:
            logger.info(f"Loaded {total_loaded} total documents across {len(user_docs)} users")
        else:
            logger.info("No documents found in database")
    finally:
        db.close()

    import api.deps as deps
    deps._rag_manager = manager

    logger.info("API server ready ✓")
    yield

    logger.info("Shutting down...")
    await manager.close()


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
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(chat_history.router)
app.include_router(clusters.router)
app.include_router(crypto.router)
app.include_router(documents.router)
app.include_router(macro.router)
app.include_router(query.router)
app.include_router(nodes.router)

# Static files for uploaded documents
STATIC_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health", tags=["system"])
async def health():
    manager = None
    try:
        from api.deps import get_rag_manager
        manager = get_rag_manager()
    except Exception:
        pass

    gpu_available = False
    try:
        import torch
        gpu_available = torch.cuda.is_available()
    except Exception:
        pass

    return {
        "status": "ok",
        "model_loaded": manager is not None and manager._embedding is not None,
        "user_count": len(manager._user_rags) if manager else 0,
        "gpu_available": gpu_available,
    }


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="MiA-RAG API Server")
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--port", type=int, default=6006)
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
