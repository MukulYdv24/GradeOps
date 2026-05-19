"""
grading/schemas.py – Pydantic data models used throughout GradeOps ML.
These are also serialised as JSON API responses for the web-dev team.
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from enum import Enum
import uuid
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────
class GradeStatus(str, Enum):
    PENDING   = "pending"
    GRADED    = "graded"
    APPROVED  = "approved"
    OVERRIDDEN = "overridden"


class PlagiarismLevel(str, Enum):
    NONE    = "none"
    LOW     = "low"
    MEDIUM  = "medium"
    HIGH    = "high"


# ─────────────────────────────────────────────
# Rubric
# ─────────────────────────────────────────────
class RubricCriterion(BaseModel):
    """A single scoreable criterion within a question."""
    criterion_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    description: str                   # e.g. "Correct formula applied"
    max_points: float                  # e.g. 3.0
    keywords: list[str] = []          # hints for the LLM
    partial_credit_allowed: bool = True


class RubricQuestion(BaseModel):
    """One question in the exam rubric."""
    question_id: str                   # e.g. "Q1", "Q2a"
    question_text: str
    max_points: float
    criteria: list[RubricCriterion]


class Rubric(BaseModel):
    """Top-level rubric JSON that professors upload."""
    rubric_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    exam_name: str
    total_points: float
    questions: list[RubricQuestion]


# ─────────────────────────────────────────────
# OCR Output
# ─────────────────────────────────────────────
class ExtractedAnswer(BaseModel):
    """Raw OCR result for one student's answer to one question."""
    student_id: str
    question_id: str
    raw_text: str                      # OCR transcription
    image_path: str                    # cropped image stored on disk / S3
    confidence: float = 1.0           # OCR confidence score 0–1
    page_number: int = 1


# ─────────────────────────────────────────────
# Grading
# ─────────────────────────────────────────────
class CriterionScore(BaseModel):
    """Score awarded for a single rubric criterion."""
    criterion_id: str
    criterion_description: str
    points_awarded: float
    max_points: float
    justification: str                 # one-sentence LLM reasoning


class QuestionGrade(BaseModel):
    """Full grade for one question."""
    student_id: str
    question_id: str
    total_awarded: float
    total_max: float
    criterion_scores: list[CriterionScore]
    overall_justification: str        # paragraph summary
    status: GradeStatus = GradeStatus.PENDING
    ta_override_points: Optional[float] = None
    ta_comment: Optional[str] = None
    graded_at: datetime = Field(default_factory=datetime.utcnow)


class ExamGrade(BaseModel):
    """All grades for one student's entire exam."""
    exam_id: str
    student_id: str
    question_grades: list[QuestionGrade]
    total_score: float
    max_score: float
    percentage: float
    plagiarism_level: PlagiarismLevel = PlagiarismLevel.NONE
    plagiarism_details: Optional[str] = None


# ─────────────────────────────────────────────
# Plagiarism
# ─────────────────────────────────────────────
class PlagiarismFlag(BaseModel):
    """A detected pair of suspiciously similar answers."""
    student_a: str
    student_b: str
    question_id: str
    similarity_score: float            # cosine similarity 0–1
    level: PlagiarismLevel
    snippet_a: str                     # short excerpt from student A
    snippet_b: str                     # short excerpt from student B


# ─────────────────────────────────────────────
# API Request / Response wrappers
# ─────────────────────────────────────────────
class GradeJobRequest(BaseModel):
    exam_id: str
    rubric_id: str
    # Bug 3 fix: was a broken separate FastAPI param; moved here so the
    # body parses correctly. Each dict: {"question_id": "Q1", "bbox": [x,y,w,h]}
    answer_regions: list[dict] = []


class GradeJobResponse(BaseModel):
    job_id: str
    exam_id: str
    status: str
    message: str


class TAOverrideRequest(BaseModel):
    answer_id: str        # "<student_id>_<question_id>"
    new_points: float
    comment: str


class TAOverrideResponse(BaseModel):
    answer_id: str
    previous_points: float
    new_points: float
    status: GradeStatus