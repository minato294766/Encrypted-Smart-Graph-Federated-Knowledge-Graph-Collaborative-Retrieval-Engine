"""
Pydantic schemas for API request/response models.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Auth ─────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    email: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    node_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Documents ────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: int
    filename: str
    size_bytes: int
    char_count: int
    status: str  # "pending", "processing", "ready", "error"
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    total: int
    documents: list[DocumentResponse]


# ── Query ────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(default="mix", pattern="^(local|global|hybrid|mix|naive)$")
    top_k: int = Field(default=60, ge=10, le=200)
    chunk_top_k: int = Field(default=20, ge=5, le=100)


class EvidenceItem(BaseModel):
    source: str
    content: str
    relevance: float


class QueryResponse(BaseModel):
    id: int
    question: str
    answer: str
    confidence: Optional[float] = None
    mode: str
    mindscape_used: bool
    evidence: list[EvidenceItem] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class QueryHistoryResponse(BaseModel):
    total: int
    queries: list[QueryResponse]


# ── Nodes ────────────────────────────────────────────────────────

class NodeRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    node_type: str = Field(default="edge", pattern="^(edge|center)$")
    endpoint_url: Optional[str] = None
    description: Optional[str] = None


class NodeApplyCenter(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)


class NodeApprove(BaseModel):
    approved: bool


class NodeResponse(BaseModel):
    id: int
    node_id: str
    name: str
    node_type: str
    status: str  # "pending", "active", "suspended"
    endpoint_url: Optional[str] = None
    description: Optional[str] = None
    registered_at: datetime

    model_config = {"from_attributes": True}


class NodeListResponse(BaseModel):
    total: int
    nodes: list[NodeResponse]


# ── Health ───────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    mindscape_ready: bool
    document_count: int
    gpu_available: bool
