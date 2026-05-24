"""
SQLAlchemy ORM models for API database tables.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    email = Column(String(128), nullable=True)
    role = Column(String(32), default="user")  # "user", "admin"
    node_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    queries = relationship("QueryLog", back_populates="user")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(256), nullable=False)
    file_path = Column(String(512), nullable=False)
    size_bytes = Column(Integer, default=0)
    char_count = Column(Integer, default=0)
    content = Column(Text, nullable=True)
    status = Column(String(32), default="pending")  # pending, processing, ready, error
    uploaded_at = Column(DateTime, default=_utcnow)


class QueryLog(Base):
    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    mode = Column(String(32), default="mix")
    mindscape_used = Column(Integer, default=0)
    evidence_json = Column(Text, nullable=True)  # JSON-serialized evidence list
    created_at = Column(DateTime, default=_utcnow)

    user = relationship("User", back_populates="queries")


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    node_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    node_type = Column(String(32), default="edge")  # "edge", "center"
    status = Column(String(32), default="pending")  # pending, active, suspended
    endpoint_url = Column(String(512), nullable=True)
    description = Column(Text, nullable=True)
    center_application = Column(Text, nullable=True)  # reason for center node application
    registered_at = Column(DateTime, default=_utcnow)
