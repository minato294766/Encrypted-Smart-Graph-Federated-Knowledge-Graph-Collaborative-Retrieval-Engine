"""
Query router: ask questions and retrieve history.
"""

import json
import os

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, get_rag_manager, get_user_rag
from ..models import QueryLog, User
from ..schemas import EvidenceItem, QueryHistoryResponse, QueryRequest, QueryResponse

router = APIRouter(prefix="/api/query", tags=["query"])

# Internal federation token for node-to-node communication
FEDERATION_INTERNAL_TOKEN = os.getenv("FEDERATION_INTERNAL_TOKEN", "")

# Compliance mode: when enabled, QueryLog does not store question/answer content
# per design doc 3.3.4 (audit logs should only store node/time/status/confidence)
AUDIT_COMPLIANCE_MODE = os.getenv("AUDIT_COMPLIANCE_MODE", "false").strip().lower() == "true"


def _extract_evidence(result: dict) -> list[EvidenceItem]:
    """Extract structured evidence from query result context."""
    evidence = []
    ctx = result.get("context", {})
    if not isinstance(ctx, dict):
        return evidence

    for chunk in ctx.get("fine_chunks", [])[:5]:
        if isinstance(chunk, dict) and chunk.get("content"):
            evidence.append(EvidenceItem(
                source=chunk.get("id", "unknown"),
                content=chunk.get("content", "")[:500],
                relevance=chunk.get("score", 0.0),
            ))
    for comm in ctx.get("coarse_communities", [])[:3]:
        if isinstance(comm, dict):
            evidence.append(EvidenceItem(
                source=f"社区{comm.get('id', '?')}: {comm.get('summary', '')}",
                content="、".join(comm.get("top_entities", [])[:5]),
                relevance=0.7,
            ))
    for chunk in ctx.get("chunks", [])[:3]:
        if isinstance(chunk, dict) and chunk.get("content"):
            evidence.append(EvidenceItem(
                source=chunk.get("source", "unknown"),
                content=str(chunk.get("content", ""))[:500],
                relevance=chunk.get("score", 0.0),
            ))
    return evidence


@router.post("/", response_model=QueryResponse)
async def ask(
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rag = await get_user_rag(current_user.id)
    result = await rag.query(
        question=body.question,
        mode=body.mode,
        top_k=body.top_k,
        chunk_top_k=body.chunk_top_k,
    )

    evidence = _extract_evidence(result)
    confidence = result.get("metadata", {}).get("confidence", None)
    evidence_json = json.dumps([e.model_dump() for e in evidence], ensure_ascii=False) if not AUDIT_COMPLIANCE_MODE else None

    log = QueryLog(
        user_id=current_user.id,
        question=body.question if not AUDIT_COMPLIANCE_MODE else None,
        answer=result["answer"] if not AUDIT_COMPLIANCE_MODE else None,
        confidence=confidence,
        mode=body.mode,
        mindscape_used=1 if result.get("metadata", {}).get("mindscape_used") else 0,
        evidence_json=evidence_json,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return QueryResponse(
        id=log.id,
        question=body.question,
        answer=result["answer"],
        confidence=confidence,
        mode=body.mode,
        mindscape_used=result.get("metadata", {}).get("mindscape_used", False),
        evidence=evidence,
        created_at=log.created_at,
    )


@router.get("/history", response_model=QueryHistoryResponse)
def history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(QueryLog)
        .filter(QueryLog.user_id == current_user.id)
        .order_by(QueryLog.created_at.desc())
        .limit(50)
        .all()
    )

    queries = []
    for log in logs:
        evidence = []
        if log.evidence_json:
            try:
                evidence = [EvidenceItem(**e) for e in json.loads(log.evidence_json)]
            except (json.JSONDecodeError, TypeError):
                pass

        queries.append(QueryResponse(
            id=log.id,
            question=log.question,
            answer=log.answer or "",
            confidence=log.confidence,
            mode=log.mode,
            mindscape_used=bool(log.mindscape_used),
            evidence=evidence,
            created_at=log.created_at,
        ))

    return QueryHistoryResponse(total=len(queries), queries=queries)


class InternalQueryRequest(BaseModel):
    """Simplified request for internal federation calls."""
    question: str = Field(..., min_length=1, max_length=4000)


class InternalQueryResponse(BaseModel):
    """Simplified response for internal federation calls."""
    requestId: str
    status: str
    answer: str
    confidence: float = 0.0
    mindscape_used: bool = False
    details: list[dict] = []
    evidence: list[dict] = []
    parsed_query: dict = {}


@router.post("/internal", response_model=InternalQueryResponse)
async def internal_query(
    body: InternalQueryRequest,
    x_federation_token: str = Header(None, alias="X-Federation-Token"),
    x_request_id: str = Header(None, alias="X-Request-Id"),
    db: Session = Depends(get_db),
):
    """
    Internal endpoint for federation node-to-node calls.
    Uses X-Federation-Token header for authentication instead of JWT.
    Returns rich evidence for knowledge traceability.
    """
    if not FEDERATION_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Federation internal token not configured",
        )
    if not x_federation_token or x_federation_token != FEDERATION_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid federation token",
        )

    manager = get_rag_manager()
    result = await manager.query_global(
        question=body.question,
        mode="mix",
        top_k=60,
        chunk_top_k=20,
    )

    # Convert evidence to frontend-expected format
    details = []
    ctx = result.get("context", {})
    if isinstance(ctx, dict):
        for chunk in ctx.get("fine_chunks", [])[:5]:
            if isinstance(chunk, dict) and chunk.get("content"):
                details.append({
                    "source": chunk.get("id", "unknown"),
                    "content": chunk.get("content", "")[:500],
                    "score": chunk.get("score", 0.0),
                })

    # Build evidence list for traceability
    evidence_list = []
    for e in _extract_evidence(result):
        evidence_list.append({
            "source": e.source,
            "content": e.content,
            "relevance": e.relevance,
        })

    return InternalQueryResponse(
        requestId=x_request_id or "internal",
        status="ok",
        answer=result.get("answer", ""),
        confidence=result.get("metadata", {}).get("confidence", 0.0),
        mindscape_used=result.get("metadata", {}).get("mindscape_used", False),
        details=details,
        evidence=evidence_list,
        parsed_query=result.get("parsed_query", {}),
    )
