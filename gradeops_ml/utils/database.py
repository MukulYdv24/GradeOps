"""
utils/database.py – SQLAlchemy ORM models and DB session management.
Run `alembic upgrade head` to apply migrations after setup.
"""
from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, Boolean, Text, DateTime, ForeignKey, Enum as SAEnum, create_engine
)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID

from config import settings


# ─────────────────────────────────────────────────────────────────
# Engine & Session
# ─────────────────────────────────────────────────────────────────

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """FastAPI dependency — yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────
# ORM Models
# ─────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class DBExam(Base):
    __tablename__ = "exams"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False)
    rubric_id   = Column(String, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    status      = Column(String, default="uploaded")    # uploaded|grading|done

    answers     = relationship("DBAnswer", back_populates="exam")


class DBRubric(Base):
    __tablename__ = "rubrics"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_name   = Column(String, nullable=False)
    total_points = Column(Float, nullable=False)
    json_data   = Column(Text, nullable=False)           # full rubric JSON
    created_at  = Column(DateTime, default=datetime.utcnow)


class DBAnswer(Base):
    """Stores OCR output and AI grade for one student × one question."""
    __tablename__ = "answers"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id         = Column(String, ForeignKey("exams.id"), nullable=False)
    student_id      = Column(String, nullable=False)
    question_id     = Column(String, nullable=False)

    # OCR
    raw_text        = Column(Text, nullable=True)
    image_path      = Column(String, nullable=True)      # path / S3 key
    ocr_confidence  = Column(Float, default=1.0)

    # Grading
    total_awarded   = Column(Float, nullable=True)
    total_max       = Column(Float, nullable=True)
    justification   = Column(Text, nullable=True)
    criterion_json  = Column(Text, nullable=True)        # JSON list of CriterionScore
    status          = Column(String, default="pending")  # pending|graded|approved|overridden

    # TA Override
    ta_override_points = Column(Float, nullable=True)
    ta_comment      = Column(Text, nullable=True)
    reviewed_at     = Column(DateTime, nullable=True)

    graded_at       = Column(DateTime, default=datetime.utcnow)
    exam            = relationship("DBExam", back_populates="answers")


class DBPlagiarismFlag(Base):
    __tablename__ = "plagiarism_flags"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id         = Column(String, nullable=False)
    student_a       = Column(String, nullable=False)
    student_b       = Column(String, nullable=False)
    question_id     = Column(String, nullable=False)
    similarity_score = Column(Float, nullable=False)
    level           = Column(String, nullable=False)     # none|low|medium|high
    snippet_a       = Column(Text, nullable=True)
    snippet_b       = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


def create_tables():
    """Create all tables (dev convenience). Use Alembic in production."""
    Base.metadata.create_all(bind=engine)
