"""
Clusters router: cluster and file management CRUD.
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import Cluster, ClusterFile, User
from ..schemas import (
    ClusterCreate,
    ClusterDetailResponse,
    ClusterFileResponse,
    ClusterListResponse,
    ClusterResponse,
    DatabaseMetricsResponse,
)

router = APIRouter(prefix="/api/database/clusters", tags=["clusters"])

UPLOAD_DIR = Path("./uploads/clusters")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/metrics", response_model=DatabaseMetricsResponse)
def get_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get database metrics for the current user."""
    from sqlalchemy import func

    cluster_count = db.query(Cluster).filter(Cluster.user_id == current_user.id).count()

    total_files = (
        db.query(ClusterFile)
        .join(Cluster)
        .filter(Cluster.user_id == current_user.id)
        .count()
    )

    total_size = (
        db.query(func.sum(ClusterFile.size_bytes))
        .join(Cluster)
        .filter(Cluster.user_id == current_user.id)
        .scalar()
    ) or 0

    last_file = (
        db.query(ClusterFile)
        .join(Cluster)
        .filter(Cluster.user_id == current_user.id)
        .order_by(ClusterFile.uploaded_at.desc())
        .first()
    )

    return DatabaseMetricsResponse(
        cluster_count=cluster_count,
        total_files=total_files,
        total_size_bytes=total_size,
        last_added_date=last_file.uploaded_at if last_file else None,
    )


@router.get("", response_model=ClusterListResponse)
def list_clusters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all clusters for the current user."""
    clusters = (
        db.query(Cluster)
        .filter(Cluster.user_id == current_user.id)
        .order_by(Cluster.updated_at.desc())
        .all()
    )
    result = []
    for c in clusters:
        file_count = db.query(ClusterFile).filter(ClusterFile.cluster_id == c.id).count()
        result.append(ClusterResponse(
            id=c.id,
            user_id=c.user_id,
            name=c.name,
            description=c.description,
            created_at=c.created_at,
            updated_at=c.updated_at,
            file_count=file_count,
        ))
    return ClusterListResponse(total=len(result), clusters=result)


@router.post("", response_model=ClusterResponse)
def create_cluster(
    body: ClusterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new cluster."""
    cluster = Cluster(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
    )
    db.add(cluster)
    db.commit()
    db.refresh(cluster)
    return ClusterResponse(
        id=cluster.id,
        user_id=cluster.user_id,
        name=cluster.name,
        description=cluster.description,
        created_at=cluster.created_at,
        updated_at=cluster.updated_at,
        file_count=0,
    )


@router.get("/{cluster_id}", response_model=ClusterDetailResponse)
def get_cluster(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a cluster with all files."""
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.user_id == current_user.id)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    files = (
        db.query(ClusterFile)
        .filter(ClusterFile.cluster_id == cluster_id)
        .order_by(ClusterFile.uploaded_at.desc())
        .all()
    )
    return ClusterDetailResponse(
        id=cluster.id,
        user_id=cluster.user_id,
        name=cluster.name,
        description=cluster.description,
        created_at=cluster.created_at,
        updated_at=cluster.updated_at,
        file_count=len(files),
        files=[ClusterFileResponse.model_validate(f) for f in files],
    )


@router.delete("/{cluster_id}")
def delete_cluster(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a cluster and all its files."""
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.user_id == current_user.id)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # Delete physical files
    files = db.query(ClusterFile).filter(ClusterFile.cluster_id == cluster_id).all()
    for f in files:
        file_path = Path(f.file_path)
        if file_path.exists():
            file_path.unlink()

    db.delete(cluster)
    db.commit()
    return {"message": "Cluster deleted"}


@router.post("/{cluster_id}/files", response_model=ClusterFileResponse)
async def upload_file(
    cluster_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file to a cluster."""
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.user_id == current_user.id)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # Read file content
    content = await file.read()
    size_bytes = len(content)

    # Save file to disk
    file_id = str(uuid.uuid4())
    file_ext = Path(file.filename or "unknown").suffix
    saved_filename = f"{file_id}{file_ext}"
    file_path = UPLOAD_DIR / saved_filename
    file_path.write_bytes(content)

    # Extract text content for supported formats
    text_content = None
    if file.content_type and file.content_type.startswith("text/"):
        try:
            text_content = content.decode("utf-8")
        except UnicodeDecodeError:
            pass

    # Create database record
    cluster_file = ClusterFile(
        cluster_id=cluster_id,
        filename=file.filename or "unknown",
        file_path=str(file_path),
        size_bytes=size_bytes,
        mime_type=file.content_type or "application/octet-stream",
        content=text_content,
        status="ready",
    )
    db.add(cluster_file)

    # Update cluster timestamp
    cluster.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(cluster_file)

    # 异步加载到用户专属知识图谱
    if text_content:
        try:
            from ..deps import get_user_rag
            import asyncio

            async def _insert_to_user_kg():
                user_rag = await get_user_rag(current_user.id)
                await user_rag.insert_documents([text_content])

            asyncio.create_task(_insert_to_user_kg())
        except Exception:
            pass  # 静默失败，不影响上传响应

    return ClusterFileResponse.model_validate(cluster_file)


@router.get("/{cluster_id}/files", response_model=list[ClusterFileResponse])
def list_files(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all files in a cluster."""
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.user_id == current_user.id)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    files = (
        db.query(ClusterFile)
        .filter(ClusterFile.cluster_id == cluster_id)
        .order_by(ClusterFile.uploaded_at.desc())
        .all()
    )
    return [ClusterFileResponse.model_validate(f) for f in files]


@router.delete("/{cluster_id}/files/{file_id}")
def delete_file(
    cluster_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a file from a cluster."""
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.user_id == current_user.id)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    file = (
        db.query(ClusterFile)
        .filter(ClusterFile.id == file_id, ClusterFile.cluster_id == cluster_id)
        .first()
    )
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    # Delete physical file
    file_path = Path(file.file_path)
    if file_path.exists():
        file_path.unlink()

    db.delete(file)

    # Update cluster timestamp
    cluster.updated_at = datetime.now(timezone.utc)

    db.commit()
    return {"message": "File deleted"}
