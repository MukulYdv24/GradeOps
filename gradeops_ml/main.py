"""
main.py – FastAPI application exposing all ML endpoints.

Start the server:
    uvicorn main:app --reload --port 8000

API docs (auto-generated):
    http://localhost:8000/docs
"""
from __future__ import annotations
import json
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import (
    FastAPI, File, Form, UploadFile, HTTPException,
    BackgroundTasks, Depends, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

from config import settings
from grading.schemas import (
    Rubric, GradeJobRequest, GradeJobResponse,
    TAOverrideRequest, TAOverrideResponse, GradeStatus
)
from grading.rubric_parser import load_rubric_from_dict
from pipeline import run_full_pipeline
from utils.storage import get_storage
from utils.pdf_utils import validate_pdf, get_page_count, split_pdf_by_pages
from utils.database import get_db, create_tables, DBExam, DBRubric, DBAnswer, DBPlagiarismFlag
from sqlalchemy.orm import Session


# ─────────────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="GradeOps ML API",
    description="ML backend for AI-assisted exam grading (HITL pipeline).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files statically (for the TA dashboard to display cropped images)
uploads_dir = Path(settings.local_storage_path)
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(uploads_dir)), name="files")

# In-memory job tracker (replace with Redis/Celery in production)
_jobs: dict[str, dict] = {}


@app.on_event("startup")
async def startup():
    logger.info("GradeOps ML API starting up …")
    create_tables()


# ─────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok", "env": settings.app_env}


# ─────────────────────────────────────────────────────────────────
# Rubric endpoints
# ─────────────────────────────────────────────────────────────────

@app.post("/api/rubrics", response_model=dict, tags=["Rubrics"])
async def create_rubric(
    rubric_data: dict,
    db: Session = Depends(get_db),
):
    """
    Upload / create a grading rubric.

    Body: JSON matching the Rubric schema (see grading/schemas.py).
    Returns the assigned rubric_id.
    """
    try:
        rubric = load_rubric_from_dict(rubric_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db_rubric = DBRubric(
        id=rubric.rubric_id,
        exam_name=rubric.exam_name,
        total_points=rubric.total_points,
        json_data=json.dumps(rubric_data),
    )
    db.add(db_rubric)
    db.commit()

    logger.info(f"Rubric saved: {rubric.rubric_id} — '{rubric.exam_name}'")
    return {"rubric_id": rubric.rubric_id, "exam_name": rubric.exam_name}


@app.get("/api/rubrics/{rubric_id}", tags=["Rubrics"])
async def get_rubric(rubric_id: str, db: Session = Depends(get_db)):
    """Retrieve a stored rubric by ID."""
    row = db.query(DBRubric).filter(DBRubric.id == rubric_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rubric not found")
    return json.loads(row.json_data)


# ─────────────────────────────────────────────────────────────────
# Exam upload endpoints
# ─────────────────────────────────────────────────────────────────

@app.post("/api/exams/upload", response_model=dict, tags=["Exams"])
async def upload_exam(
    exam_name: Annotated[str, Form()],
    rubric_id: Annotated[str, Form()],
    pages_per_student: Annotated[int, Form()] = 2,
    student_ids: Annotated[str, Form()] = "",  # comma-separated, optional
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload one or more PDF files containing scanned exam papers.

    - Single bulk PDF: pass one file; it will be split by pages_per_student.
    - Multiple PDFs: one per student (pages_per_student ignored).

    Returns exam_id to use when triggering grading.
    """
    exam_id = str(uuid.uuid4())
    storage = get_storage()
    saved_pdfs: list[str] = []
    detected_students: list[str] = []

    s_ids_list = [s.strip() for s in student_ids.split(",") if s.strip()]

    pdf_dir = Path(settings.local_storage_path) / "pdfs" / exam_id
    pdf_dir.mkdir(parents=True, exist_ok=True)

    if len(files) == 1 and not s_ids_list:
        # Bulk PDF — split by pages_per_student
        raw = await files[0].read()
        if not validate_pdf(raw):
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

        bulk_path = pdf_dir / "bulk.pdf"
        bulk_path.write_bytes(raw)
        splits = split_pdf_by_pages(raw, pages_per_student, pdf_dir)

        for s_id, p in splits:
            saved_pdfs.append(str(p))
            detected_students.append(s_id)

    else:
        # One PDF per student
        for i, f in enumerate(files):
            raw = await f.read()
            if not validate_pdf(raw):
                logger.warning(f"Skipping invalid PDF: {f.filename}")
                continue

            s_id = s_ids_list[i] if i < len(s_ids_list) else f"S{i+1:03d}"
            dest = pdf_dir / f"{s_id}_exam.pdf"
            dest.write_bytes(raw)
            saved_pdfs.append(str(dest))
            detected_students.append(s_id)

    # Persist exam record
    db_exam = DBExam(
        id=exam_id,
        name=exam_name,
        rubric_id=rubric_id,
        status="uploaded",
    )
    db.add(db_exam)
    db.commit()

    logger.info(
        f"Exam uploaded: id={exam_id} students={len(detected_students)}"
    )
    return {
        "exam_id": exam_id,
        "exam_name": exam_name,
        "students_detected": len(detected_students),
        "student_ids": detected_students,
        "status": "uploaded",
    }


# ─────────────────────────────────────────────────────────────────
# Grading trigger
# ─────────────────────────────────────────────────────────────────

@app.post("/api/grade", response_model=GradeJobResponse, tags=["Grading"])
async def trigger_grading(
    req: GradeJobRequest,
    answer_regions: list[dict],         # [{"question_id": "Q1", "bbox": [x,y,w,h]}]
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Trigger the full ML pipeline for an uploaded exam.

    Runs asynchronously — poll /api/jobs/{job_id} for status.
    """
    # Fetch exam
    exam = db.query(DBExam).filter(DBExam.id == req.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Fetch rubric
    rubric_row = db.query(DBRubric).filter(DBRubric.id == req.rubric_id).first()
    if not rubric_row:
        raise HTTPException(status_code=404, detail="Rubric not found")

    rubric_dict = json.loads(rubric_row.json_data)

    # Collect student PDFs
    pdf_dir = Path(settings.local_storage_path) / "pdfs" / req.exam_id
    pdf_paths = sorted(pdf_dir.glob("*_exam.pdf"))
    student_ids = [p.stem.replace("_exam", "") for p in pdf_paths]

    if not pdf_paths:
        raise HTTPException(status_code=400, detail="No student PDFs found for this exam")

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "running", "exam_id": req.exam_id}

    async def _run():
        try:
            results = await run_full_pipeline(
                exam_id=req.exam_id,
                pdf_paths=[str(p) for p in pdf_paths],
                student_ids=student_ids,
                rubric_dict=rubric_dict,
                answer_regions=answer_regions,
            )
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["results"] = results
            # Update exam status in DB
            exam.status = "done"
            db.commit()
        except Exception as e:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = str(e)
            logger.error(f"Pipeline job {job_id} failed: {e}")

    background_tasks.add_task(_run)

    return GradeJobResponse(
        job_id=job_id,
        exam_id=req.exam_id,
        status="running",
        message="Grading pipeline started. Poll /api/jobs/{job_id} for updates.",
    )


@app.get("/api/jobs/{job_id}", tags=["Grading"])
async def get_job_status(job_id: str):
    """Poll a background grading job."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _jobs[job_id]


# ─────────────────────────────────────────────────────────────────
# Results endpoints (for the TA dashboard)
# ─────────────────────────────────────────────────────────────────

@app.get("/api/results/{exam_id}", tags=["Results"])
async def get_exam_results(exam_id: str, db: Session = Depends(get_db)):
    """
    Return all graded answers for an exam.
    This is the primary endpoint for the TA review dashboard.
    """
    answers = (
        db.query(DBAnswer)
        .filter(DBAnswer.exam_id == exam_id)
        .all()
    )
    if not answers:
        raise HTTPException(status_code=404, detail="No results found for exam")

    return [
        {
            "answer_id": a.id,
            "student_id": a.student_id,
            "question_id": a.question_id,
            "raw_text": a.raw_text,
            "image_url": f"/files/crops/{exam_id}/{a.student_id}/{a.student_id}_{a.question_id}.png",
            "total_awarded": a.ta_override_points if a.ta_override_points is not None else a.total_awarded,
            "total_max": a.total_max,
            "justification": a.justification,
            "criterion_scores": json.loads(a.criterion_json) if a.criterion_json else [],
            "status": a.status,
            "ta_comment": a.ta_comment,
        }
        for a in answers
    ]


@app.get("/api/results/{exam_id}/student/{student_id}", tags=["Results"])
async def get_student_results(exam_id: str, student_id: str, db: Session = Depends(get_db)):
    """Return grades for a single student across all questions."""
    answers = (
        db.query(DBAnswer)
        .filter(DBAnswer.exam_id == exam_id, DBAnswer.student_id == student_id)
        .all()
    )
    if not answers:
        raise HTTPException(status_code=404, detail="Student results not found")
    return answers


# ─────────────────────────────────────────────────────────────────
# TA Override
# ─────────────────────────────────────────────────────────────────

@app.patch("/api/results/override", response_model=TAOverrideResponse, tags=["Results"])
async def ta_override(req: TAOverrideRequest, db: Session = Depends(get_db)):
    """
    TA approves an override for a student's question grade.
    The answer_id is the DB primary key of the DBAnswer row.
    """
    answer = db.query(DBAnswer).filter(DBAnswer.id == req.answer_id).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer record not found")

    prev = answer.ta_override_points or answer.total_awarded
    answer.ta_override_points = req.new_points
    answer.ta_comment = req.comment
    answer.status = GradeStatus.OVERRIDDEN.value
    db.commit()

    logger.info(
        f"TA override: answer={req.answer_id} "
        f"{prev} → {req.new_points} pts | comment='{req.comment}'"
    )
    return TAOverrideResponse(
        answer_id=req.answer_id,
        previous_points=prev,
        new_points=req.new_points,
        status=GradeStatus.OVERRIDDEN,
    )


@app.patch("/api/results/approve/{answer_id}", tags=["Results"])
async def ta_approve(answer_id: str, db: Session = Depends(get_db)):
    """TA approves the AI grade without changes (keyboard shortcut action)."""
    answer = db.query(DBAnswer).filter(DBAnswer.id == answer_id).first()
    if not answer:
        raise HTTPException(status_code=404, detail="Answer not found")

    answer.status = GradeStatus.APPROVED.value
    db.commit()
    return {"answer_id": answer_id, "status": GradeStatus.APPROVED}


# ─────────────────────────────────────────────────────────────────
# Plagiarism endpoints
# ─────────────────────────────────────────────────────────────────

@app.get("/api/plagiarism/{exam_id}", tags=["Plagiarism"])
async def get_plagiarism_flags(exam_id: str, db: Session = Depends(get_db)):
    """Return all plagiarism flags for an exam."""
    flags = (
        db.query(DBPlagiarismFlag)
        .filter(DBPlagiarismFlag.exam_id == exam_id)
        .order_by(DBPlagiarismFlag.similarity_score.desc())
        .all()
    )
    return [
        {
            "id": f.id,
            "student_a": f.student_a,
            "student_b": f.student_b,
            "question_id": f.question_id,
            "similarity_score": f.similarity_score,
            "level": f.level,
            "snippet_a": f.snippet_a,
            "snippet_b": f.snippet_b,
        }
        for f in flags
    ]
