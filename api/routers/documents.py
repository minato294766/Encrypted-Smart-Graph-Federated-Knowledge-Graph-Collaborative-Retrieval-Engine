"""
Documents router: upload, list, delete, and trigger reprocessing.
"""

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, get_user_rag
from ..models import Document, User
from ..schemas import DocumentListResponse, DocumentResponse

UPLOAD_DIR = Path("./uploads")
ALLOWED_EXTENSIONS = {".txt", ".pdf", ".docx", ".md", ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".wav", ".mp3"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff"}
MULTIMODAL_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".tiff"}

router = APIRouter(prefix="/api/documents", tags=["documents"])


class InsertRequest(BaseModel):
    content: str


class InsertFileRequest(BaseModel):
    """Request body for multimodal file content insertion."""
    file_path: str
    file_name: str = ""


@router.post("/insert")
async def insert_document_text(
    body: InsertRequest,
    current_user: User = Depends(get_current_user),
):
    """Insert text content directly into LightRAG knowledge graph."""
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content is empty")
    if len(content) < 50:
        raise HTTPException(status_code=400, detail="Content too short (min 50 chars)")

    try:
        rag = await get_user_rag(current_user.id)
        await rag.insert_documents([content])
        return {"status": "ok", "chars": len(content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/insert-file")
async def insert_document_file(
    body: InsertFileRequest,
    current_user: User = Depends(get_current_user),
):
    """Insert a file (text, PDF, or image) into the knowledge graph with multimodal processing.

    Uses MiARAG.insert_files() which routes through ImageProcessor/PDFProcessor.
    """
    file_path = body.file_path.strip()
    if not file_path:
        raise HTTPException(status_code=400, detail="file_path is required")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    ext = Path(file_path).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    try:
        rag = await get_user_rag(current_user.id)
        await rag.insert_files([file_path])
        return {"status": "ok", "file": file_path, "type": ext}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _read_text_content(file_path: str) -> tuple[int, str | None]:
    """Try to read text content from file. Returns (char_count, content_or_none)."""
    encodings = ["utf-8", "gbk", "gb2312", "gb18030", "latin-1"]
    for enc in encodings:
        try:
            content = Path(file_path).read_text(encoding=enc)
            return len(content), content
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 0, None


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{current_user.id}_{file.filename}"
    file_path = UPLOAD_DIR / safe_name

    content_bytes = await file.read()
    file_path.write_bytes(content_bytes)

    char_count, content = _read_text_content(str(file_path))

    doc = Document(
        user_id=current_user.id,
        filename=file.filename or "unknown",
        file_path=str(file_path),
        size_bytes=len(content_bytes),
        char_count=char_count,
        content=content,
        status="ready" if content else "processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Insert into knowledge graph with multimodal support
    try:
        rag = await get_user_rag(current_user.id)
        if ext in MULTIMODAL_EXTENSIONS:
            await rag.insert_files([str(file_path)])
        elif content:
            await rag.insert_documents([content])
        doc.status = "ready"
        db.commit()
    except Exception:
        doc.status = "error"
        db.commit()

    return DocumentResponse.model_validate(doc)


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    docs = db.query(Document).filter(Document.user_id == current_user.id).order_by(Document.uploaded_at.desc()).all()
    return DocumentListResponse(
        total=len(docs),
        documents=[DocumentResponse.model_validate(d) for d in docs],
    )


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse.model_validate(doc)


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
    return {"detail": "Document deleted"}
