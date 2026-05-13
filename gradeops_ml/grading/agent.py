"""
grading/agent.py – LangGraph agentic grading pipeline.

Graph structure:
  START
    ↓
  [parse_rubric]        – validate rubric, prep prompt templates
    ↓
  [grade_criteria]      – LLM scores each rubric criterion
    ↓
  [generate_justification] – LLM writes a human-readable summary
    ↓
  [finalise_grade]      – compute totals, assemble QuestionGrade object
    ↓
  END

Run with:
    result = run_grading_agent(extracted_answer, rubric_question)
"""
from __future__ import annotations
import json
import re
from typing import TypedDict, Annotated
from datetime import datetime

from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from loguru import logger

from config import settings
from grading.schemas import (
    CriterionScore,
    ExtractedAnswer,
    GradeStatus,
    QuestionGrade,
    RubricQuestion,
)
from grading.rubric_parser import rubric_to_grading_prompt


# ─────────────────────────────────────────────────────────────────
# LangGraph State
# ─────────────────────────────────────────────────────────────────

class GradingState(TypedDict):
    """Mutable state threaded through each LangGraph node."""
    # Inputs
    student_id: str
    question_id: str
    student_answer: str           # OCR transcription
    rubric_question: dict         # RubricQuestion serialised to dict
    # Intermediate
    rubric_prompt: str
    criterion_scores: list[dict]  # list of CriterionScore dicts
    # Outputs
    overall_justification: str
    final_grade: dict             # QuestionGrade serialised to dict
    error: str | None


# ─────────────────────────────────────────────────────────────────
# LLM client (shared across nodes)
# ─────────────────────────────────────────────────────────────────

def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.grading_llm_model,
        temperature=settings.grading_temperature,
        max_tokens=settings.grading_max_tokens,
        openai_api_key=settings.openai_api_key,
    )


# ─────────────────────────────────────────────────────────────────
# Node 1 – Parse rubric into a grading prompt
# ─────────────────────────────────────────────────────────────────

def parse_rubric_node(state: GradingState) -> GradingState:
    """Convert the rubric dict back to a RubricQuestion and build the prompt."""
    try:
        rq = RubricQuestion(**state["rubric_question"])
        state["rubric_prompt"] = rubric_to_grading_prompt(rq)
        state["error"] = None
    except Exception as e:
        state["error"] = f"parse_rubric failed: {e}"
        logger.error(state["error"])
    return state


# ─────────────────────────────────────────────────────────────────
# Node 2 – Score each criterion with the LLM
# ─────────────────────────────────────────────────────────────────

_CRITERION_SYSTEM = """You are a strict but fair university exam grader.
You will receive a rubric and a student's handwritten answer (transcribed).
For EACH criterion in the rubric, output a JSON array (and NOTHING else).

Each element must have:
  criterion_id       – same as in the rubric
  points_awarded     – a float between 0 and max_points (inclusive)
  justification      – one clear sentence explaining why this score was given

Rules:
- Be consistent and objective.
- Only award partial credit when the rubric explicitly allows it.
- If the answer is blank or clearly illegible, award 0.
- Do NOT add markdown fences. Output raw JSON array only.
"""

_CRITERION_USER = """RUBRIC:
{rubric_prompt}

STUDENT ANSWER (transcribed from handwriting):
\"\"\"
{student_answer}
\"\"\"

Return the JSON array of criterion scores now:"""


def grade_criteria_node(state: GradingState) -> GradingState:
    """Ask the LLM to score every criterion; parse the JSON response."""
    if state.get("error"):
        return state

    llm = _get_llm()
    rq = RubricQuestion(**state["rubric_question"])

    messages = [
        SystemMessage(content=_CRITERION_SYSTEM),
        HumanMessage(
            content=_CRITERION_USER.format(
                rubric_prompt=state["rubric_prompt"],
                student_answer=state["student_answer"],
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        raw = response.content.strip()
        # Strip accidental markdown fences
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

        scores_raw: list[dict] = json.loads(raw)

        # Validate against rubric criteria
        criterion_map = {c.criterion_id: c for c in rq.criteria}
        validated: list[dict] = []
        for s in scores_raw:
            c_id = s.get("criterion_id", "")
            criterion = criterion_map.get(c_id)
            if criterion is None:
                logger.warning(f"Unknown criterion_id '{c_id}' from LLM — skipping")
                continue
            awarded = float(s.get("points_awarded", 0))
            awarded = max(0.0, min(awarded, criterion.max_points))
            validated.append(
                CriterionScore(
                    criterion_id=c_id,
                    criterion_description=criterion.description,
                    points_awarded=awarded,
                    max_points=criterion.max_points,
                    justification=s.get("justification", ""),
                ).model_dump()
            )

        state["criterion_scores"] = validated
        logger.info(
            f"  Scored {len(validated)} criteria for "
            f"{state['student_id']}/{state['question_id']}"
        )

    except Exception as e:
        state["error"] = f"grade_criteria failed: {e}"
        logger.error(state["error"])
        state["criterion_scores"] = []

    return state


# ─────────────────────────────────────────────────────────────────
# Node 3 – Generate a natural-language justification paragraph
# ─────────────────────────────────────────────────────────────────

_JUSTIFICATION_SYSTEM = """You are a university teaching assistant writing brief,
constructive feedback on a student's exam answer.
Based on the criterion-level scores provided, write ONE paragraph (3–5 sentences)
that:
  1. States the total score earned and maximum.
  2. Summarises what the student did correctly.
  3. Explains any lost marks.
  4. Gives one actionable suggestion.
Keep the tone professional and encouraging."""

_JUSTIFICATION_USER = """Question: {question_text}
Max Points: {max_points}

Criterion scores:
{scores_summary}

Write the justification paragraph:"""


def generate_justification_node(state: GradingState) -> GradingState:
    """Generate a readable feedback paragraph for the TA review dashboard."""
    if state.get("error"):
        state["overall_justification"] = "Grading error — manual review required."
        return state

    rq = RubricQuestion(**state["rubric_question"])
    llm = _get_llm()

    scores_summary = "\n".join(
        f"  [{s['criterion_id']}] {s['criterion_description']}: "
        f"{s['points_awarded']}/{s['max_points']} — {s['justification']}"
        for s in state["criterion_scores"]
    )

    messages = [
        SystemMessage(content=_JUSTIFICATION_SYSTEM),
        HumanMessage(
            content=_JUSTIFICATION_USER.format(
                question_text=rq.question_text,
                max_points=rq.max_points,
                scores_summary=scores_summary,
            )
        ),
    ]

    try:
        response = llm.invoke(messages)
        state["overall_justification"] = response.content.strip()
    except Exception as e:
        state["error"] = f"generate_justification failed: {e}"
        state["overall_justification"] = "Justification generation failed."
        logger.error(state["error"])

    return state


# ─────────────────────────────────────────────────────────────────
# Node 4 – Finalise the grade object
# ─────────────────────────────────────────────────────────────────

def finalise_grade_node(state: GradingState) -> GradingState:
    """Aggregate criterion scores into a QuestionGrade."""
    rq = RubricQuestion(**state["rubric_question"])

    total_awarded = sum(s["points_awarded"] for s in state["criterion_scores"])
    total_max = rq.max_points

    grade = QuestionGrade(
        student_id=state["student_id"],
        question_id=state["question_id"],
        total_awarded=round(total_awarded, 2),
        total_max=total_max,
        criterion_scores=[CriterionScore(**s) for s in state["criterion_scores"]],
        overall_justification=state.get("overall_justification", ""),
        status=GradeStatus.GRADED,
        graded_at=datetime.utcnow(),
    )

    state["final_grade"] = grade.model_dump(mode="json")
    logger.info(
        f"  ✓ Grade finalised: {state['student_id']} / {state['question_id']} "
        f"→ {total_awarded:.1f}/{total_max}"
    )
    return state


# ─────────────────────────────────────────────────────────────────
# Build the LangGraph
# ─────────────────────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    graph = StateGraph(GradingState)

    graph.add_node("parse_rubric", parse_rubric_node)
    graph.add_node("grade_criteria", grade_criteria_node)
    graph.add_node("generate_justification", generate_justification_node)
    graph.add_node("finalise_grade", finalise_grade_node)

    graph.set_entry_point("parse_rubric")
    graph.add_edge("parse_rubric", "grade_criteria")
    graph.add_edge("grade_criteria", "generate_justification")
    graph.add_edge("generate_justification", "finalise_grade")
    graph.add_edge("finalise_grade", END)

    return graph.compile()


_grading_graph = None


def _get_graph():
    global _grading_graph
    if _grading_graph is None:
        _grading_graph = _build_graph()
    return _grading_graph


# ─────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────

def run_grading_agent(
    extracted_answer: ExtractedAnswer,
    rubric_question: RubricQuestion,
) -> QuestionGrade:
    """
    Grade a single student answer against a rubric question.

    Args:
        extracted_answer:  OCR output (student_id, question_id, raw_text).
        rubric_question:   The relevant RubricQuestion from the loaded rubric.

    Returns:
        A fully populated QuestionGrade object.
    """
    graph = _get_graph()

    initial_state: GradingState = {
        "student_id": extracted_answer.student_id,
        "question_id": extracted_answer.question_id,
        "student_answer": extracted_answer.raw_text,
        "rubric_question": rubric_question.model_dump(),
        "rubric_prompt": "",
        "criterion_scores": [],
        "overall_justification": "",
        "final_grade": {},
        "error": None,
    }

    final_state = graph.invoke(initial_state)

    if final_state.get("error") and not final_state.get("final_grade"):
        # Return a zero-score fallback grade on hard errors
        return QuestionGrade(
            student_id=extracted_answer.student_id,
            question_id=extracted_answer.question_id,
            total_awarded=0.0,
            total_max=rubric_question.max_points,
            criterion_scores=[],
            overall_justification=f"Auto-grading error: {final_state['error']}",
            status=GradeStatus.PENDING,
        )

    return QuestionGrade(**final_state["final_grade"])
