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
    status: str = "pending"
    node_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PendingUserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApproveUserRequest(BaseModel):
    approved: bool


# ── Documents ────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: int
    user_id: int
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


# ── Chat History ─────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)
    confidence: Optional[float] = None
    evidence_json: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    confidence: Optional[float] = None
    evidence_json: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatConversationCreate(BaseModel):
    title: str = Field(default="新对话", max_length=256)
    mode: str = Field(default="mix", pattern="^(local|global|hybrid|mix|naive)$")


class ChatConversationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    mode: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []

    model_config = {"from_attributes": True}


class ChatConversationListResponse(BaseModel):
    total: int
    conversations: list[ChatConversationResponse]


# ── Clusters ─────────────────────────────────────────────────────

class ClusterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None


class ClusterFileResponse(BaseModel):
    id: int
    cluster_id: int
    filename: str
    size_bytes: int
    mime_type: str
    status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ClusterResponse(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    file_count: int = 0

    model_config = {"from_attributes": True}


class ClusterListResponse(BaseModel):
    total: int
    clusters: list[ClusterResponse]


class ClusterDetailResponse(ClusterResponse):
    files: list[ClusterFileResponse] = []


class DatabaseMetricsResponse(BaseModel):
    cluster_count: int
    total_files: int
    total_size_bytes: int
    last_added_date: Optional[datetime] = None


class DatabaseUpdateResponse(BaseModel):
    id: str
    actor: str
    action: str
    type: str  # "cluster", "file", "admin"
    created_at: str

    model_config = {"from_attributes": True}


class DatabaseUpdateListResponse(BaseModel):
    total: int
    updates: list[DatabaseUpdateResponse]
