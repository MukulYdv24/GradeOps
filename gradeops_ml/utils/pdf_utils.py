"""
utils/pdf_utils.py – Helpers for handling exam PDF uploads.

Responsibilities:
- Validate uploaded PDFs
- Extract page count and metadata
- Split multi-student PDFs (one student per N pages)
- Save individual student PDFs to storage
"""
from __future__ import annotations
import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from loguru import logger


def validate_pdf(file_bytes: bytes) -> bool:
    """Return True if bytes represent a readable PDF."""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        _ = len(reader.pages)
        return True
    except Exception:
        return False


def get_page_count(file_bytes: bytes) -> int:
    """Return the number of pages in a PDF."""
    reader = PdfReader(io.BytesIO(file_bytes))
    return len(reader.pages)


def split_pdf_by_pages(
    file_bytes: bytes,
    pages_per_student: int,
    output_dir: str | Path,
    student_ids: list[str] | None = None,
) -> list[tuple[str, Path]]:
    """
    Split a bulk exam PDF into per-student PDFs.

    Args:
        file_bytes:         Raw PDF bytes (the bulk upload).
        pages_per_student:  How many pages each student's exam occupies.
        output_dir:         Directory to save individual PDFs.
        student_ids:        Optional list of student IDs in order.
                            If None, uses sequential IDs: S001, S002, …

    Returns:
        List of (student_id, pdf_path) tuples.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(io.BytesIO(file_bytes))
    total_pages = len(reader.pages)
    num_students = total_pages // pages_per_student

    if student_ids and len(student_ids) != num_students:
        logger.warning(
            f"student_ids count ({len(student_ids)}) != detected students ({num_students}). "
            f"Using sequential IDs."
        )
        student_ids = None

    results: list[tuple[str, Path]] = []
    for i in range(num_students):
        s_id = student_ids[i] if student_ids else f"S{i+1:03d}"
        writer = PdfWriter()

        start = i * pages_per_student
        end = start + pages_per_student
        for page_num in range(start, min(end, total_pages)):
            writer.add_page(reader.pages[page_num])

        out_path = output_dir / f"{s_id}_exam.pdf"
        with open(out_path, "wb") as f:
            writer.write(f)

        results.append((s_id, out_path))
        logger.debug(f"  Split: pages {start+1}–{end} → {s_id} ({out_path.name})")

    logger.info(f"Split {total_pages}-page PDF into {len(results)} student exams.")
    return results


def extract_page_as_bytes(file_bytes: bytes, page_number: int) -> bytes:
    """
    Extract a single page from a PDF and return it as PDF bytes.
    Page numbers are 0-indexed.
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    writer = PdfWriter()
    writer.add_page(reader.pages[page_number])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()
