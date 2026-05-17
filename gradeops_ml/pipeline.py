"""
pipeline.py – Full end-to-end GradeOps ML pipeline orchestrator.

This is the main entry point called by FastAPI background tasks.
It coordinates:
  1. PDF → page images (preprocessor)
  2. Page images → cropped answer regions → OCR text (extractor)
  3. OCR text + rubric → AI grades (grading agent)
  4. All answers → plagiarism flags (detector)
  5. Persist everything to the database
"""
from __future__ import annotations
import json
import traceback
import uuid
from pathlib import Path
from typing import Callable

from loguru import logger

from config import settings
from grading.schemas import ExamGrade, PlagiarismLevel, QuestionGrade
from grading.agent import run_grading_agent
from grading.rubric_parser import load_rubric_from_dict, get_question
from ocr.preprocessor import pdf_to_images, crop_answer_regions
from ocr.extractor import extract_exam_answers
from plagiarism.detector import detect_all_questions
from utils.storage import get_storage


# ─────────────────────────────────────────────────────────────────
# Progress callback type
# ─────────────────────────────────────────────────────────────────
ProgressCallback = Callable[[str, int, int], None]   # (message, current, total)


# ─────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────

async def run_full_pipeline(
    exam_id: str,
    pdf_paths: list[str],               # one PDF per student
    student_ids: list[str],             # parallel list
    rubric_dict: dict,                  # raw rubric JSON dict
    answer_regions: list[dict],         # [{"question_id": "Q1", "bbox": [x,y,w,h]}] per page
    on_progress: ProgressCallback | None = None,
) -> dict:
    """
    Run the complete grading pipeline for one exam session.

    Args:
        exam_id:         Unique identifier for this exam session.
        pdf_paths:       List of per-student PDF file paths.
        student_ids:     Student IDs corresponding to each PDF.
        rubric_dict:     Parsed rubric as a Python dict.
        answer_regions:  List of bounding-box specs for each question.
        on_progress:     Optional callback(message, current, total).

    Returns:
        dict with keys: exam_grades, plagiarism_flags, summary
    """
    def progress(msg: str, cur: int, tot: int):
        logger.info(f"[Pipeline] [{cur}/{tot}] {msg}")
        if on_progress:
            on_progress(msg, cur, tot)

    total_students = len(student_ids)
    storage = get_storage()
    rubric = load_rubric_from_dict(rubric_dict)

    question_texts = {
        q.question_id: q.question_text for q in rubric.questions
    }

    all_extracted = []     # flat list of ExtractedAnswer
    all_exam_grades = []   # list of ExamGrade

    # ── Stage 1 & 2: OCR per student ──────────────────────────────
    for idx, (s_id, pdf_path) in enumerate(zip(student_ids, pdf_paths)):
        progress(f"OCR: {s_id}", idx + 1, total_students)
        try:
            page_dir = Path(settings.local_storage_path) / "pages" / exam_id / s_id
            page_images = pdf_to_images(pdf_path, output_dir=page_dir)

            # Use first page only in simple mode
            # (extend to multi-page with page-to-question mapping as needed)
            first_page = str(page_images[0])

            crop_dir = Path(settings.local_storage_path) / "crops" / exam_id / s_id
            cropped = crop_answer_regions(
                first_page, answer_regions, crop_dir, s_id
            )

            extracted = extract_exam_answers(cropped, s_id, question_texts)
            all_extracted.extend(extracted)

        except Exception:
            logger.error(
                f"OCR failed for {s_id}:\n{traceback.format_exc()}"
            )

    # ── Stage 3: Grading per student per question ─────────────────
    for idx, s_id in enumerate(student_ids):
        progress(f"Grading: {s_id}", idx + 1, total_students)
        student_answers = [a for a in all_extracted if a.student_id == s_id]
        question_grades: list[QuestionGrade] = []

        for answer in student_answers:
            rq = get_question(rubric, answer.question_id)
            if rq is None:
                logger.warning(f"No rubric question for {answer.question_id} — skipping")
                continue
            try:
                grade = run_grading_agent(answer, rq)
                question_grades.append(grade)
            except Exception:
                logger.error(
                    f"Grading error {s_id}/{answer.question_id}:\n{traceback.format_exc()}"
                )

        total_scored = sum(g.total_awarded for g in question_grades)
        max_scored = sum(g.total_max for g in question_grades)
        pct = round(total_scored / max_scored * 100, 1) if max_scored else 0.0

        exam_grade = ExamGrade(
            exam_id=exam_id,
            student_id=s_id,
            question_grades=question_grades,
            total_score=total_scored,
            max_score=max_scored,
            percentage=pct,
        )
        all_exam_grades.append(exam_grade)

    # ── Stage 4: Plagiarism detection ─────────────────────────────
    progress("Running plagiarism detection …", total_students, total_students)
    try:
        plag_flags = detect_all_questions(all_extracted)

        # Attach plagiarism level to each ExamGrade
        flagged_students: dict[str, PlagiarismLevel] = {}
        for flag in plag_flags:
            for s in [flag.student_a, flag.student_b]:
                prev = flagged_students.get(s, PlagiarismLevel.NONE)
                if flag.level.value > prev.value:   # string enum ordering works here
                    flagged_students[s] = flag.level

        for eg in all_exam_grades:
            if eg.student_id in flagged_students:
                eg.plagiarism_level = flagged_students[eg.student_id]

    except Exception:
        logger.error(f"Plagiarism detection failed:\n{traceback.format_exc()}")
        plag_flags = []

    # ── Summary ───────────────────────────────────────────────────
    summary = {
        "exam_id": exam_id,
        "total_students": total_students,
        "graded_students": len(all_exam_grades),
        "avg_score": round(
            sum(e.percentage for e in all_exam_grades) / max(len(all_exam_grades), 1), 1
        ),
        "plagiarism_flags": len(plag_flags),
        "high_plagiarism": sum(1 for f in plag_flags if f.level == PlagiarismLevel.HIGH),
    }

    logger.info(
        f"[Pipeline] Done — exam={exam_id} | "
        f"{summary['graded_students']} graded | "
        f"avg={summary['avg_score']}% | "
        f"flags={summary['plagiarism_flags']}"
    )

    return {
        "exam_grades": [eg.model_dump(mode="json") for eg in all_exam_grades],
        "plagiarism_flags": [f.model_dump(mode="json") for f in plag_flags],
        "summary": summary,
    }
