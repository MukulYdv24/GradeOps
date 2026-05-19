"""
ocr/extractor.py – Handwritten answer extraction using Qwen2-VL.

Qwen2-VL is a vision-language model that understands images + text prompts,
making it excellent for messy handwritten content.
"""
from __future__ import annotations
import re
import time
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from loguru import logger

from config import settings
from grading.schemas import ExtractedAnswer

# ── lazy model cache (loaded once per process) ────────────────────
_model: Any = None
_processor: Any = None


def _load_model() -> tuple[Any, Any]:
    """Load Qwen2-VL model and processor (first call only)."""
    global _model, _processor
    if _model is not None:
        return _model, _processor

    logger.info(f"Loading OCR model: {settings.ocr_model} …")
    from transformers import (
        Qwen2VLForConditionalGeneration,
        AutoProcessor,
        BitsAndBytesConfig,
    )
    from qwen_vl_utils import process_vision_info  # noqa: F401 – side effect import

    device = settings.ocr_device

    _processor = AutoProcessor.from_pretrained(
        settings.ocr_model,
        trust_remote_code=True,
    )

    if device == "cuda":
        # 4-bit quantization: cuts VRAM from ~14 GB → ~4 GB with minimal
        # quality loss for transcription tasks. Requires bitsandbytes:
        #   pip install bitsandbytes --break-system-packages
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,   # extra 0.4 bits saved
            bnb_4bit_quant_type="nf4",         # best quality for LLMs
            bnb_4bit_compute_dtype=torch.float16,
        )
        logger.info("CUDA detected — loading with 4-bit quantization (~4 GB VRAM)")
        _model = Qwen2VLForConditionalGeneration.from_pretrained(
            settings.ocr_model,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )
    else:
        # CPU path: use the smaller 2B variant automatically to stay within
        # typical RAM budgets. The 7B model will OOM on most laptops on CPU.
        cpu_model = settings.ocr_model
        if "7B" in cpu_model or "7b" in cpu_model:
            cpu_model = cpu_model.replace("7B", "2B").replace("7b", "2b")
            logger.warning(
                f"CPU detected — switching to 2B model ({cpu_model}) to avoid "
                f"OOM. Set ocr_device=cuda in .env to use the 7B model."
            )
        logger.info(f"Loading {cpu_model} in float32 on CPU …")
        _model = Qwen2VLForConditionalGeneration.from_pretrained(
            cpu_model,
            torch_dtype=torch.float32,
            device_map="cpu",
            trust_remote_code=True,
        )

    _model.eval()
    logger.info("OCR model ready.")
    return _model, _processor


# ─────────────────────────────────────────────────────────────────
# Core extraction
# ─────────────────────────────────────────────────────────────────

_OCR_PROMPT = """\
You are a forensic transcription engine for handwritten exam answers.
Your ONLY job is to copy every character exactly as it appears on the page.

CRITICAL RULES — violating any of these is a transcription failure:
1. Preserve ALL spelling mistakes exactly. If a student wrote "mitochodra",
   you MUST output "mitochodra", NOT "mitochondria". Do NOT fix typos.
2. Preserve ALL grammatical errors, crossed-out words, and abbreviations.
3. Do NOT interpret, paraphrase, or add anything not visible on the page.
4. Do NOT auto-complete partial words.
5. If the image is blank or completely unreadable, reply with exactly: [BLANK]

Your output must be a verbatim copy of what is written — nothing more.
"""


def extract_text_from_image(
    image: Image.Image | str | Path,
    question_context: str = "",
) -> tuple[str, float]:
    """
    Run Qwen2-VL on a single image and return (transcribed_text, confidence).

    Args:
        image:            PIL Image or path to an image file.
        question_context: Optional question text to help the model focus.

    Returns:
        (raw_text, confidence_score 0–1)
    """
    model, processor = _load_model()

    if isinstance(image, (str, Path)):
        image = Image.open(image).convert("RGB")
    else:
        image = image.convert("RGB")

    prompt = _OCR_PROMPT
    if question_context:
        prompt += f"\n\nQuestion context: {question_context}"

    # Build Qwen2-VL message format
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt},
            ],
        }
    ]

    from qwen_vl_utils import process_vision_info

    text_input = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    image_inputs, video_inputs = process_vision_info(messages)

    inputs = processor(
        text=[text_input],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    ).to(settings.ocr_device)

    t0 = time.time()
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=settings.ocr_max_new_tokens,
        )

    # Strip the input prompt tokens from the output
    generated = output_ids[:, inputs["input_ids"].shape[1]:]
    raw_text = processor.batch_decode(
        generated, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0].strip()

    elapsed = time.time() - t0
    logger.debug(f"  OCR finished in {elapsed:.2f}s — {len(raw_text)} chars")

    # Simple confidence heuristic: penalise very short outputs on non-blank images
    confidence = _estimate_confidence(raw_text, image)
    return raw_text, confidence


def _estimate_confidence(text: str, image: Image.Image) -> float:
    """
    Heuristic confidence score.
    Real-world improvement: use token log-probabilities from the model.
    """
    if text == "[BLANK]":
        return 1.0

    # Estimate how much of the image has ink (dark pixels)
    import numpy as np
    grey = np.array(image.convert("L"))
    dark_fraction = (grey < 128).sum() / grey.size

    if dark_fraction < 0.01 and len(text) < 10:
        return 0.4   # very little ink but model found text → uncertain
    if len(text) > 20:
        return 0.92
    return 0.75


# ─────────────────────────────────────────────────────────────────
# Batch extraction (full exam)
# ─────────────────────────────────────────────────────────────────

def extract_exam_answers(
    cropped_regions: list[dict],
    student_id: str,
    question_texts: dict[str, str] | None = None,
) -> list[ExtractedAnswer]:
    """
    Run OCR on every cropped answer region for one student.

    Args:
        cropped_regions:  Output from preprocessor.crop_answer_regions().
        student_id:       The student's ID.
        question_texts:   Mapping question_id → question text (optional context).

    Returns:
        List of ExtractedAnswer objects ready for the grading agent.
    """
    question_texts = question_texts or {}
    results: list[ExtractedAnswer] = []

    for region in cropped_regions:
        q_id = region["question_id"]
        pil_image = region["pil_image"]
        crop_path = region["crop_path"]

        logger.info(f"  OCR: student={student_id} question={q_id}")
        context = question_texts.get(q_id, "")

        try:
            raw_text, confidence = extract_text_from_image(pil_image, context)
        except Exception as exc:
            logger.error(f"  OCR failed for {student_id}/{q_id}: {exc}")
            raw_text = "[OCR_ERROR]"
            confidence = 0.0

        results.append(
            ExtractedAnswer(
                student_id=student_id,
                question_id=q_id,
                raw_text=raw_text,
                image_path=crop_path,
                confidence=confidence,
            )
        )

    return results