"""
Query router: ask questions and retrieve history.
"""

import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, get_rag
from ..models import QueryLog, User
from ..schemas import EvidenceItem, QueryHistoryResponse, QueryRequest, QueryResponse

router = APIRouter(prefix="/api/query", tags=["query"])


@router.post("/", response_model=QueryResponse)
async def ask(
    body: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rag = get_rag()
    result = await rag.query(
        question=body.question,
        mode=body.mode,
        top_k=body.top_k,
        chunk_top_k=body.chunk_top_k,
    )

    evidence = []
    ctx = result.get("context", {})
    if isinstance(ctx, dict):
        # Fine-channel chunks
        for chunk in ctx.get("fine_chunks", [])[:5]:
            if isinstance(chunk, dict) and chunk.get("content"):
                evidence.append(EvidenceItem(
                    source=chunk.get("id", "unknown"),
                    content=chunk.get("content", "")[:500],
                    relevance=chunk.get("score", 0.0),
                ))
        # Coarse-channel communities as evidence sources
        for comm in ctx.get("coarse_communities", [])[:3]:
            if isinstance(comm, dict):
                evidence.append(EvidenceItem(
                    source=f"社区{comm.get('id', '?')}: {comm.get('summary', '')}",
                    content="、".join(comm.get("top_entities", [])[:5]),
                    relevance=0.7,
                ))
        # Fallback: LightRAG chunks
        for chunk in ctx.get("chunks", [])[:3]:
            if isinstance(chunk, dict) and chunk.get("content"):
                evidence.append(EvidenceItem(
                    source=chunk.get("source", "unknown"),
                    content=str(chunk.get("content", ""))[:500],
                    relevance=chunk.get("score", 0.0),
                ))

    confidence = result.get("metadata", {}).get("confidence", None)
    evidence_json = json.dumps([e.model_dump() for e in evidence], ensure_ascii=False)

    log = QueryLog(
        user_id=current_user.id,
        question=body.question,
        answer=result["answer"],
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
