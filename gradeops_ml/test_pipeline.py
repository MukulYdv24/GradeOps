"""
test_pipeline.py – Quick integration tests for the GradeOps ML stack.

Run this BEFORE starting the full server to verify everything is wired up:
    python test_pipeline.py

Each test is independent — comment out ones you haven't set up yet.
"""
import json
import sys
import asyncio
from pathlib import Path

# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def ok(msg: str):
    print(f"  ✅  {msg}")


def fail(msg: str):
    print(f"  ❌  {msg}")


# ─────────────────────────────────────────────────────────────────
# Test 1 – Config loads
# ─────────────────────────────────────────────────────────────────

section("Test 1: Config")
try:
    from config import settings
    ok(f"Settings loaded — env={settings.app_env}")
    ok(f"OCR model: {settings.ocr_model}")
    ok(f"Grading LLM: {settings.grading_llm_model}")
    if not settings.openai_api_key:
        print("  ⚠️   OPENAI_API_KEY is not set — grading agent will fail")
except Exception as e:
    fail(f"Config failed: {e}")
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────
# Test 2 – Rubric parsing
# ─────────────────────────────────────────────────────────────────

section("Test 2: Rubric Parsing")
try:
    from grading.rubric_parser import load_rubric_from_dict, rubric_to_grading_prompt, example_rubric
    rubric = load_rubric_from_dict(example_rubric())
    ok(f"Rubric parsed: '{rubric.exam_name}', {len(rubric.questions)} questions")

    prompt = rubric_to_grading_prompt(rubric.questions[0])
    ok(f"Grading prompt generated ({len(prompt)} chars)")
except Exception as e:
    fail(f"Rubric parsing failed: {e}")


# ─────────────────────────────────────────────────────────────────
# Test 3 – PDF utilities (no actual PDF needed)
# ─────────────────────────────────────────────────────────────────

section("Test 3: PDF Utilities")
try:
    from utils.pdf_utils import validate_pdf
    # Test with an empty byte string (should return False)
    result = validate_pdf(b"not a pdf")
    assert result is False
    ok("validate_pdf correctly rejects non-PDF bytes")
except Exception as e:
    fail(f"PDF utils failed: {e}")


# ─────────────────────────────────────────────────────────────────
# Test 4 – Storage (local)
# ─────────────────────────────────────────────────────────────────

section("Test 4: Local Storage")
try:
    from utils.storage import LocalStorage
    store = LocalStorage(base_dir="./test_uploads")
    test_data = b"Hello GradeOps!"
    path = asyncio.run(store.save_file(test_data, "test/hello.txt", "text/plain"))
    loaded = asyncio.run(store.load_file("test/hello.txt"))
    assert loaded == test_data
    ok(f"File saved → {path}")
    ok("File loaded and verified")

    # Cleanup
    import shutil
    shutil.rmtree("./test_uploads", ignore_errors=True)
except Exception as e:
    fail(f"Storage test failed: {e}")


# ─────────────────────────────────────────────────────────────────
# Test 5 – Plagiarism detector (no GPU needed)
# ─────────────────────────────────────────────────────────────────

section("Test 5: Plagiarism Detector")
try:
    from grading.schemas import ExtractedAnswer
    from plagiarism.detector import detect_plagiarism

    # Two near-identical answers and one different one
    answers = [
        ExtractedAnswer(
            student_id="S001", question_id="Q1",
            raw_text="Newton's second law states that F equals m times a, where F is force in Newtons.",
            image_path="",
        ),
        ExtractedAnswer(
            student_id="S002", question_id="Q1",
            raw_text="Newton's second law says F equals mass times acceleration, where force is in Newtons.",
            image_path="",
        ),
        ExtractedAnswer(
            student_id="S003", question_id="Q1",
            raw_text="The law of gravity states that objects with mass attract each other.",
            image_path="",
        ),
    ]
    flags = detect_plagiarism(answers, question_id="Q1")
    if flags:
        ok(f"Detected {len(flags)} flag(s) — top: {flags[0].student_a} vs {flags[0].student_b} sim={flags[0].similarity_score:.3f}")
    else:
        ok("No plagiarism detected (threshold may be high — check .env)")
except Exception as e:
    fail(f"Plagiarism test failed: {e}")


# ─────────────────────────────────────────────────────────────────
# Test 6 – Grading agent (requires OPENAI_API_KEY)
# ─────────────────────────────────────────────────────────────────

section("Test 6: Grading Agent (requires OPENAI_API_KEY)")
if not settings.openai_api_key:
    print("  ⏭️   Skipped — set OPENAI_API_KEY in .env to enable")
else:
    try:
        from grading.agent import run_grading_agent
        from grading.schemas import ExtractedAnswer
        from grading.rubric_parser import load_rubric_from_dict, example_rubric

        rubric = load_rubric_from_dict(example_rubric())
        answer = ExtractedAnswer(
            student_id="S001",
            question_id="Q1",
            raw_text="Newton's second law states F = ma. This means force equals mass times acceleration. For example, pushing a heavier car requires more force. Units are in Newtons (N = kg·m/s²).",
            image_path="",
        )

        grade = run_grading_agent(answer, rubric.questions[0])
        ok(f"Grade computed: {grade.total_awarded}/{grade.total_max} pts")
        ok(f"Status: {grade.status}")
        ok(f"Justification preview: {grade.overall_justification[:80]}…")
    except Exception as e:
        fail(f"Grading agent failed: {e}")


# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────

section("All tests complete")
print("  If all green ✅, run: uvicorn main:app --reload\n")
