"""
ocr/preprocessor.py – Convert uploaded PDFs to per-page images,
then crop individual answer regions for the OCR model.
"""
from __future__ import annotations
import os
import uuid
from pathlib import Path
from typing import Generator

import cv2
import numpy as np
from pdf2image import convert_from_path
from PIL import Image
from loguru import logger

from config import settings


# ─────────────────────────────────────────────────────────────────
# PDF → Images
# ─────────────────────────────────────────────────────────────────

def pdf_to_images(
    pdf_path: str | Path,
    dpi: int = 300,
    output_dir: str | Path | None = None,
) -> list[Path]:
    """
    Convert every page of a PDF to a high-resolution PNG.

    Args:
        pdf_path:   Path to the PDF file.
        dpi:        Render DPI (300 gives good OCR quality).
        output_dir: Where to save page images. Defaults to a temp folder.

    Returns:
        Ordered list of paths to the saved page images.
    """
    pdf_path = Path(pdf_path)
    if output_dir is None:
        output_dir = Path(settings.local_storage_path) / "pages" / pdf_path.stem
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Converting PDF '{pdf_path.name}' to images at {dpi} DPI …")
    pages: list[Image.Image] = convert_from_path(str(pdf_path), dpi=dpi)

    saved: list[Path] = []
    for i, page in enumerate(pages):
        out = output_dir / f"page_{i+1:03d}.png"
        page.save(str(out), "PNG")
        saved.append(out)
        logger.debug(f"  Saved page {i+1} → {out}")

    logger.info(f"  Total pages extracted: {len(saved)}")
    return saved


# ─────────────────────────────────────────────────────────────────
# Image preprocessing helpers
# ─────────────────────────────────────────────────────────────────

def preprocess_image(image_path: str | Path) -> np.ndarray:
    """
    Apply standard preprocessing to improve OCR accuracy:
      - Greyscale conversion
      - Adaptive thresholding (handles uneven lighting)
      - Deskewing
      - Noise removal

    Returns a preprocessed numpy array (uint8, single-channel).
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    # Greyscale
    grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Noise removal with median blur
    denoised = cv2.medianBlur(grey, 3)

    # Adaptive threshold → binarise
    binary = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=31,
        C=10,
    )

    # Deskew
    binary = _deskew(binary)

    return binary


def _deskew(image: np.ndarray) -> np.ndarray:
    """Rotate image to correct skew using minimum-area bounding box."""
    coords = np.column_stack(np.where(image < 128))   # dark pixels
    if coords.shape[0] < 100:
        return image  # not enough content to estimate angle

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) < 0.5:
        return image  # negligible skew

    h, w = image.shape
    centre = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(centre, angle, 1.0)
    rotated = cv2.warpAffine(
        image, M, (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    logger.debug(f"  Deskewed by {angle:.2f}°")
    return rotated


# ─────────────────────────────────────────────────────────────────
# Answer-region cropping
# ─────────────────────────────────────────────────────────────────

def crop_answer_regions(
    image_path: str | Path,
    regions: list[dict],          # list of {"question_id": str, "bbox": [x,y,w,h]}
    output_dir: str | Path,
    student_id: str,
) -> list[dict]:
    """
    Crop pre-defined bounding-box regions from a page image and save them.

    Args:
        image_path:  Full-page image.
        regions:     List of dicts with 'question_id' and 'bbox' [x, y, w, h]
                     (pixel coordinates at the PDF DPI).
        output_dir:  Where to save cropped images.
        student_id:  Student identifier embedded in the filename.

    Returns:
        List of dicts: {"question_id", "crop_path", "pil_image"}
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Cannot read: {image_path}")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for region in regions:
        q_id = region["question_id"]
        x, y, w, h = region["bbox"]
        crop = img[y: y + h, x: x + w]
        crop_path = output_dir / f"{student_id}_{q_id}.png"
        cv2.imwrite(str(crop_path), crop)

        # Convert to PIL for the VLM
        pil_crop = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
        results.append({
            "question_id": q_id,
            "crop_path": str(crop_path),
            "pil_image": pil_crop,
        })
        logger.debug(f"  Cropped {q_id} for student {student_id}")

    return results


def iter_exam_images(exams_dir: str | Path) -> Generator[tuple[str, Path], None, None]:
    """
    Yield (student_id, image_path) pairs for every PNG under exams_dir.
    Expects filenames like  <student_id>_page_001.png
    """
    exams_dir = Path(exams_dir)
    for p in sorted(exams_dir.rglob("*.png")):
        student_id = p.stem.split("_page_")[0]
        yield student_id, p
