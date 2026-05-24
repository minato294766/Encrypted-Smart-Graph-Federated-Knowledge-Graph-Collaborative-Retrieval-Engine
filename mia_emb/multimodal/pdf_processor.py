"""
PDF Processor — Extract text and images from PDF for KG insertion.

Pipeline (Section 3.1.2):
  1. PyMuPDF (fitz) extract text per page
  2. Extract embedded images → ImageProcessor
  3. Merge text + image descriptions into structured chunks

Output: list of text chunks ready for LightRAG insertion.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger("multimodal.pdf")


@dataclass
class PDFChunk:
    """A chunk of content extracted from PDF."""
    page: int
    content: str          # text content
    source: str           # source file path
    has_image: bool = False
    image_description: str = ""


@dataclass
class PDFProcessResult:
    """Result of PDF processing."""
    source_path: str
    total_pages: int
    chunks: list[PDFChunk] = field(default_factory=list)
    full_text: str = ""


class PDFProcessor:
    """Extract text and images from PDF documents."""

    def __init__(self, image_processor=None, max_chunk_chars: int = 3000):
        self.max_chunk_chars = max_chunk_chars
        self._image_processor = image_processor

    def process_file(self, pdf_path: str) -> PDFProcessResult:
        """Process a PDF file and return structured chunks."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise ImportError("PyMuPDF not installed. Install: pip install PyMuPDF")

        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        doc = fitz.open(str(path))
        total_pages = len(doc)
        chunks = []
        all_text = []

        for page_num in range(total_pages):
            page = doc[page_num]

            # Extract text
            text = page.get_text("text").strip()
            if text:
                all_text.append(text)

            # Extract images
            image_descriptions = []
            if self._image_processor:
                image_descriptions = self._extract_images(doc, page, page_num, str(path))

            # Build chunks for this page
            if text or image_descriptions:
                combined = text
                if image_descriptions:
                    img_text = "\n".join(image_descriptions)
                    combined = f"{text}\n\n[图像内容]\n{img_text}" if text else f"[图像内容]\n{img_text}"

                # Split long pages into chunks
                for chunk_text in self._split_text(combined):
                    chunks.append(PDFChunk(
                        page=page_num + 1,
                        content=chunk_text,
                        source=str(path),
                        has_image=bool(image_descriptions),
                        image_description="\n".join(image_descriptions) if image_descriptions else "",
                    ))

        doc.close()

        return PDFProcessResult(
            source_path=str(path),
            total_pages=total_pages,
            chunks=chunks,
            full_text="\n\n".join(all_text),
        )

    def _extract_images(self, doc, page, page_num: int, source: str) -> list[str]:
        """Extract and process images from a PDF page."""
        descriptions = []

        try:
            image_list = page.get_images(full=True)
        except Exception:
            return descriptions

        for img_idx, img_info in enumerate(image_list):
            try:
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                if not base_image or not base_image.get("image"):
                    continue

                image_bytes = base_image["image"]
                if len(image_bytes) < 1000:  # Skip tiny images (icons, etc.)
                    continue

                result = self._image_processor.process_bytes(
                    image_bytes, filename=f"{source}_p{page_num+1}_img{img_idx+1}"
                )
                if result.ocr_text or result.description:
                    descriptions.append(result.description)

            except Exception as e:
                logger.debug(f"Image extraction failed (page {page_num+1}, img {img_idx}): {e}")

        return descriptions

    def _split_text(self, text: str) -> list[str]:
        """Split text into chunks respecting sentence boundaries."""
        if len(text) <= self.max_chunk_chars:
            return [text]

        chunks = []
        sentences = text.replace("\n", " ").split("。")
        current = ""

        for sent in sentences:
            sent = sent.strip()
            if not sent:
                continue
            if len(current) + len(sent) + 1 > self.max_chunk_chars:
                if current:
                    chunks.append(current.strip())
                current = sent
            else:
                current = current + "。" + sent if current else sent

        if current.strip():
            chunks.append(current.strip())

        return chunks if chunks else [text[:self.max_chunk_chars]]
