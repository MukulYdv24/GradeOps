"""
grading/rubric_parser.py – Load, validate, and query JSON rubrics.

Expected rubric JSON format:
{
  "exam_name": "Midterm 2025",
  "total_points": 100,
  "questions": [
    {
      "question_id": "Q1",
      "question_text": "Explain Newton's second law.",
      "max_points": 10,
      "criteria": [
        {
          "criterion_id": "Q1_C1",
          "description": "Correct statement of F = ma",
          "max_points": 4,
          "keywords": ["force", "mass", "acceleration", "F=ma"],
          "partial_credit_allowed": true
        },
        {
          "criterion_id": "Q1_C2",
          "description": "Units correctly stated (Newtons)",
          "max_points": 2,
          "keywords": ["Newton", "N", "kg m/s^2"],
          "partial_credit_allowed": false
        }
      ]
    }
  ]
}
"""
from __future__ import annotations
import json
from pathlib import Path
from loguru import logger
from pydantic import ValidationError

from grading.schemas import Rubric, RubricQuestion, RubricCriterion


def load_rubric(rubric_path: str | Path) -> Rubric:
    """
    Load and validate a rubric JSON file.

    Raises:
        FileNotFoundError if path does not exist.
        ValueError if JSON is malformed or fails schema validation.
    """
    rubric_path = Path(rubric_path)
    if not rubric_path.exists():
        raise FileNotFoundError(f"Rubric not found: {rubric_path}")

    raw = rubric_path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in rubric: {e}")

    try:
        rubric = Rubric(**data)
    except ValidationError as e:
        raise ValueError(f"Rubric schema validation failed:\n{e}")

    logger.info(
        f"Rubric loaded: '{rubric.exam_name}' — "
        f"{len(rubric.questions)} questions, {rubric.total_points} total pts"
    )
    return rubric


def load_rubric_from_dict(data: dict) -> Rubric:
    """Parse a rubric from a raw dictionary (e.g. API request body)."""
    try:
        return Rubric(**data)
    except ValidationError as e:
        raise ValueError(f"Rubric schema validation failed:\n{e}")


def get_question(rubric: Rubric, question_id: str) -> RubricQuestion | None:
    """Fetch a single question from the rubric by ID."""
    for q in rubric.questions:
        if q.question_id == question_id:
            return q
    return None


def rubric_to_grading_prompt(rubric_question: RubricQuestion) -> str:
    """
    Convert one rubric question into a clear prompt string for the LLM grader.

    The prompt lists every criterion, its max points, keywords, and
    whether partial credit is allowed — giving the LLM a strict spec.
    """
    lines = [
        f"QUESTION [{rubric_question.question_id}]: {rubric_question.question_text}",
        f"Total marks available: {rubric_question.max_points}",
        "",
        "GRADING CRITERIA (award marks ONLY according to these):",
    ]
    for c in rubric_question.criteria:
        partial = "Partial credit ALLOWED" if c.partial_credit_allowed else "All-or-nothing"
        kw = ", ".join(c.keywords) if c.keywords else "none specified"
        lines.append(
            f"  • [{c.criterion_id}] {c.description}\n"
            f"    Max points: {c.max_points}  |  {partial}\n"
            f"    Key concepts / keywords: {kw}"
        )
    return "\n".join(lines)


def example_rubric() -> dict:
    """Return a sample rubric dict useful for testing."""
    return {
        "exam_name": "Physics Midterm – Sample",
        "total_points": 20,
        "questions": [
            {
                "question_id": "Q1",
                "question_text": "State and explain Newton's Second Law of Motion.",
                "max_points": 10,
                "criteria": [
                    {
                        "criterion_id": "Q1_C1",
                        "description": "Correctly states F = ma",
                        "max_points": 4,
                        "keywords": ["F=ma", "force", "mass", "acceleration"],
                        "partial_credit_allowed": True,
                    },
                    {
                        "criterion_id": "Q1_C2",
                        "description": "Provides a real-world example",
                        "max_points": 3,
                        "keywords": ["example", "car", "rocket", "friction"],
                        "partial_credit_allowed": True,
                    },
                    {
                        "criterion_id": "Q1_C3",
                        "description": "Correct SI units (Newtons)",
                        "max_points": 3,
                        "keywords": ["Newton", "N", "kg", "m/s^2"],
                        "partial_credit_allowed": False,
                    },
                ],
            },
            {
                "question_id": "Q2",
                "question_text": "A 5 kg object accelerates at 3 m/s². Find the net force.",
                "max_points": 10,
                "criteria": [
                    {
                        "criterion_id": "Q2_C1",
                        "description": "Applies F = ma correctly",
                        "max_points": 5,
                        "keywords": ["F=ma", "5", "3", "15"],
                        "partial_credit_allowed": True,
                    },
                    {
                        "criterion_id": "Q2_C2",
                        "description": "Final answer is 15 N with correct unit",
                        "max_points": 5,
                        "keywords": ["15", "Newton", "N"],
                        "partial_credit_allowed": False,
                    },
                ],
            },
        ],
    }
