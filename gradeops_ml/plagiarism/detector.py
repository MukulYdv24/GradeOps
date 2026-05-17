"""
plagiarism/detector.py – Semantic similarity-based plagiarism detection.

Strategy:
  1. Embed every student answer using a sentence-transformer model.
  2. Build a FAISS index for fast nearest-neighbour search.
  3. Flag pairs whose cosine similarity exceeds the configured threshold.
  4. Return structured PlagiarismFlag objects for the dashboard.
"""
from __future__ import annotations
import itertools
from typing import Any

import numpy as np
from loguru import logger

from config import settings
from grading.schemas import ExtractedAnswer, PlagiarismFlag, PlagiarismLevel

# ── lazy model cache ───────────────────────────────────────────────
_embed_model: Any = None


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading embedding model: {settings.embedding_model} …")
        _embed_model = SentenceTransformer(settings.embedding_model)
        logger.info("Embedding model ready.")
    return _embed_model


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors."""
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _level_from_score(score: float) -> PlagiarismLevel:
    """Map similarity score to a PlagiarismLevel enum."""
    if score >= 0.96:
        return PlagiarismLevel.HIGH
    if score >= settings.plagiarism_similarity_threshold:
        return PlagiarismLevel.MEDIUM
    if score >= settings.plagiarism_similarity_threshold - 0.05:
        return PlagiarismLevel.LOW
    return PlagiarismLevel.NONE


def _short_snippet(text: str, max_chars: int = 120) -> str:
    """Return a short excerpt from a student's answer."""
    clean = text.strip().replace("\n", " ")
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars].rsplit(" ", 1)[0] + " …"


# ─────────────────────────────────────────────────────────────────
# Core detection
# ─────────────────────────────────────────────────────────────────

def detect_plagiarism(
    answers: list[ExtractedAnswer],
    question_id: str | None = None,
) -> list[PlagiarismFlag]:
    """
    Detect semantically similar answers across students.

    Args:
        answers:     List of ExtractedAnswer objects for ONE question
                     (or pass mixed and filter by question_id).
        question_id: If provided, only analyse answers for this question.

    Returns:
        List of PlagiarismFlag objects (only flagged pairs).
    """
    if question_id:
        answers = [a for a in answers if a.question_id == question_id]

    # Filter blanks / errors
    valid = [
        a for a in answers
        if a.raw_text not in ("[BLANK]", "[OCR_ERROR]", "")
    ]

    if len(valid) < 2:
        return []

    model = _get_embed_model()

    texts = [a.raw_text for a in valid]
    logger.info(
        f"  Computing embeddings for {len(texts)} answers "
        f"(question={question_id or 'all'}) …"
    )
    embeddings: np.ndarray = model.encode(
        texts,
        batch_size=32,
        convert_to_numpy=True,
        show_progress_bar=False,
        normalize_embeddings=True,   # normalised → dot product == cosine
    )

    flags: list[PlagiarismFlag] = []
    n = len(valid)

    # O(n²) pairwise comparison — acceptable for typical exam sizes (< 200 students)
    for i, j in itertools.combinations(range(n), 2):
        sim = float(np.dot(embeddings[i], embeddings[j]))  # already normalised
        level = _level_from_score(sim)

        if level == PlagiarismLevel.NONE:
            continue

        a_i = valid[i]
        a_j = valid[j]
        flag = PlagiarismFlag(
            student_a=a_i.student_id,
            student_b=a_j.student_id,
            question_id=a_i.question_id,
            similarity_score=round(sim, 4),
            level=level,
            snippet_a=_short_snippet(a_i.raw_text),
            snippet_b=_short_snippet(a_j.raw_text),
        )
        flags.append(flag)
        logger.warning(
            f"  ⚠ Plagiarism [{level.value.upper()}] "
            f"Q={a_i.question_id} — "
            f"{a_i.student_id} vs {a_j.student_id} "
            f"(sim={sim:.3f})"
        )

    # Sort highest similarity first
    flags.sort(key=lambda f: f.similarity_score, reverse=True)
    return flags


def detect_all_questions(
    all_answers: list[ExtractedAnswer],
) -> list[PlagiarismFlag]:
    """
    Run plagiarism detection per question across all student answers.

    Args:
        all_answers: Every ExtractedAnswer for the whole exam session.

    Returns:
        Combined list of PlagiarismFlag objects from all questions.
    """
    question_ids = list({a.question_id for a in all_answers})
    all_flags: list[PlagiarismFlag] = []

    for q_id in question_ids:
        flags = detect_plagiarism(all_answers, question_id=q_id)
        all_flags.extend(flags)

    logger.info(f"Plagiarism scan complete — {len(all_flags)} flag(s) raised.")
    return all_flags


# ─────────────────────────────────────────────────────────────────
# FAISS-accelerated search (for very large exams: 500+ students)
# ─────────────────────────────────────────────────────────────────

def detect_plagiarism_faiss(
    answers: list[ExtractedAnswer],
    question_id: str,
    top_k: int = 5,
) -> list[PlagiarismFlag]:
    """
    FAISS-based approximate nearest-neighbour search.
    Use instead of detect_plagiarism() when n > 500.

    Returns the top_k most similar neighbours for each student.
    """
    import faiss

    valid = [
        a for a in answers
        if a.question_id == question_id
        and a.raw_text not in ("[BLANK]", "[OCR_ERROR]", "")
    ]

    if len(valid) < 2:
        return []

    model = _get_embed_model()
    embeddings = model.encode(
        [a.raw_text for a in valid],
        batch_size=32,
        convert_to_numpy=True,
        normalize_embeddings=True,
    ).astype("float32")

    d = embeddings.shape[1]
    index = faiss.IndexFlatIP(d)   # Inner product == cosine for normalised vecs
    index.add(embeddings)

    # k+1 because the top hit for each vector is itself (sim=1.0)
    sims, idxs = index.search(embeddings, min(top_k + 1, len(valid)))

    seen: set[frozenset] = set()
    flags: list[PlagiarismFlag] = []

    for i in range(len(valid)):
        for rank in range(1, sims.shape[1]):   # skip rank 0 (self)
            j = int(idxs[i, rank])
            sim = float(sims[i, rank])
            pair = frozenset({i, j})
            if pair in seen:
                continue
            seen.add(pair)

            level = _level_from_score(sim)
            if level == PlagiarismLevel.NONE:
                continue

            flags.append(
                PlagiarismFlag(
                    student_a=valid[i].student_id,
                    student_b=valid[j].student_id,
                    question_id=question_id,
                    similarity_score=round(sim, 4),
                    level=level,
                    snippet_a=_short_snippet(valid[i].raw_text),
                    snippet_b=_short_snippet(valid[j].raw_text),
                )
            )

    flags.sort(key=lambda f: f.similarity_score, reverse=True)
    return flags
