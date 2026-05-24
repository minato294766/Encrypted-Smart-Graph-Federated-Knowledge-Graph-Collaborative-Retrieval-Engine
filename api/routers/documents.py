"""
Documents router: upload, list, delete, and trigger reprocessing.
"""

import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import Document, User
from ..schemas import DocumentListResponse, DocumentResponse

UPLOAD_DIR = Path("./uploads")
ALLOWED_EXTENSIONS = {".txt", ".pdf", ".docx", ".md"}

router = APIRouter(prefix="/api/documents", tags=["documents"])


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
        filename=file.filename or "unknown",
        file_path=str(file_path),
        size_bytes=len(content_bytes),
        char_count=char_count,
        content=content,
        status="ready" if content else "error",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentResponse.model_validate(doc)


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    docs = db.query(Document).order_by(Document.uploaded_at.desc()).all()
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
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse.model_validate(doc)


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
    return {"detail": "Document deleted"}
