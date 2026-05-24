"""
Image Processor — Preprocess images and extract text/descriptions for KG insertion.

Simplified pipeline (Section 3.1.1):
  1. PIL image load + resize + normalize
  2. OCR text extraction (pytesseract, optional)
  3. Generate structured description for KG insertion

Does NOT train cross-modal projector — images are converted to text
descriptions and fed into the text-based knowledge graph.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger("multimodal.image")


@dataclass
class ImageProcessResult:
    """Result of image processing."""
    source_path: str
    description: str
    ocr_text: str
    width: int
    height: int
    format: str


class ImageProcessor:
    """Process images into text descriptions for KG insertion."""

    def __init__(self, ocr_enabled: bool = True, max_size: int = 1024):
        self.ocr_enabled = ocr_enabled
        self.max_size = max_size
        self._ocr_available = False

        if ocr_enabled:
            try:
                import pytesseract
                self._ocr_available = True
                logger.info("OCR (pytesseract) available")
            except ImportError:
                logger.warning("pytesseract not installed, OCR disabled. Install: pip install pytesseract")

    def process_file(self, image_path: str) -> ImageProcessResult:
        """Process an image file and return structured result."""
        from PIL import Image

        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        img = Image.open(path)
        return self._process_image(img, str(path))

    def process_bytes(self, image_bytes: bytes, filename: str = "image") -> ImageProcessResult:
        """Process image from bytes."""
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(image_bytes))
        return self._process_image(img, filename)

    def _process_image(self, img, source: str) -> ImageProcessResult:
        """Core processing pipeline."""
        from PIL import ImageOps

        orig_w, orig_h = img.size
        orig_format = img.format or "unknown"

        # Step 1: Preprocess
        img = self._preprocess(img)
        w, h = img.size

        # Step 2: OCR text extraction
        ocr_text = ""
        if self._ocr_available:
            ocr_text = self._extract_ocr(img)

        # Step 3: Generate description
        description = self._build_description(source, orig_w, orig_h, orig_format, ocr_text)

        return ImageProcessResult(
            source_path=source,
            description=description,
            ocr_text=ocr_text,
            width=w,
            height=h,
            format=orig_format,
        )

    def _preprocess(self, img):
        """Resize and normalize image."""
        from PIL import Image, ImageOps

        # Convert to RGB if needed
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Resize if too large
        w, h = img.size
        if max(w, h) > self.max_size:
            ratio = self.max_size / max(w, h)
            new_w, new_h = int(w * ratio), int(h * ratio)
            img = img.resize((new_w, new_h), Image.LANCZOS)

        # Auto-orient based on EXIF
        img = ImageOps.exif_transpose(img) or img

        return img

    def _extract_ocr(self, img) -> str:
        """Extract text from image via pytesseract."""
        try:
            import pytesseract
            # Use Chinese + English
            text = pytesseract.image_to_string(img, lang="chi_sim+eng")
            text = text.strip()
            if len(text) > 10:
                logger.info(f"OCR extracted {len(text)} chars")
            return text
        except Exception as e:
            logger.warning(f"OCR failed: {e}")
            return ""

    def _build_description(
        self, source: str, width: int, height: int, fmt: str, ocr_text: str
    ) -> str:
        """Generate structured description for KG insertion."""
        parts = [f"图像文件：{Path(source).name}"]
        parts.append(f"分辨率：{width}x{height}，格式：{fmt}")

        if ocr_text:
            # Truncate long OCR text
            if len(ocr_text) > 1000:
                ocr_text = ocr_text[:1000] + "..."
            parts.append(f"图像文本内容：{ocr_text}")
        else:
            parts.append("（未检测到文本内容）")

        return "\n".join(parts)
