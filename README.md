# GradeOps — AI-Powered Human-in-the-Loop Exam Grading

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue?logo=python" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi" />
  <img src="https://img.shields.io/badge/LangGraph-Agentic-orange" />
  <img src="https://img.shields.io/badge/Qwen2--VL-OCR-purple" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

> Grading handwritten exams at scale — OCR extracts answers, an agentic LLM grades them against strict rubrics with partial credit, a plagiarism detector flags suspicious pairs, and TAs review everything in a high-speed dashboard.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Usage Walkthrough](#usage-walkthrough)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Known Limitations](#known-limitations)

---

## Overview

Manual grading of handwritten exams is slow, inconsistent, and prone to fatigue-induced bias. GradeOps replaces the bulk of this work with a **Human-in-the-Loop (HITL)** pipeline:

1. Instructors upload bulk exam PDFs and define JSON rubrics with per-criterion partial credit rules.
2. A vision-language model (Qwen2-VL) performs forensic OCR — transcribing answers verbatim, preserving spelling errors.
3. A LangGraph agentic pipeline grades each answer against every rubric criterion, awarding partial credit and generating a natural-language justification.
4. A semantic + character-level plagiarism detector flags suspiciously similar answer pairs.
5. TAs review AI-proposed grades in a high-throughput dashboard with keyboard shortcuts, approving or overriding in seconds.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INSTRUCTOR FLOW                          │
│  Upload PDFs + Rubric JSON  →  Define Answer Regions (BBox)     │
│         →  Trigger Grading Job                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   FastAPI Backend       │
              │   (Background Task)     │
              └────────────┬────────────┘
                           │
          ┌────────────────▼─────────────────────┐
          │           ML Pipeline                │
          │                                      │
          │  PDF → 300 DPI Page Images           │
          │       ↓                              │
          │  Crop Answer Regions (BBox)          │
          │       ↓                              │
          │  Qwen2-VL OCR (verbatim)             │
          │       ↓                              │
          │  LangGraph Grading Agent             │
          │  ┌─ parse_rubric                     │
          │  ├─ grade_criteria  (LLM)            │
          │  ├─ generate_justification (LLM)     │
          │  └─ finalise_grade                   │
          │       ↓                              │
          │  Plagiarism Detector                 │
          │  (Semantic + Character Similarity)   │
          └────────────────┬─────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   PostgreSQL / SQLite   │
              │   (Results + Flags)     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   TA Review Dashboard   │
              │  Approve / Override     │
              │  Keyboard shortcuts     │
              └─────────────────────────┘
```

---

## Features

### Instructor Portal
- Upload multiple student PDFs in one request
- Create and manage JSON rubrics with per-criterion partial credit rules
- Draw bounding boxes on the actual 300 DPI page image to define answer regions per question
- Trigger and monitor background grading jobs with real-time status polling

### AI Grading Pipeline
- **Forensic OCR** — Qwen2-VL transcribes answers verbatim; spelling errors are preserved, not corrected
- **Agentic LangGraph grading** — 4-node graph: rubric parsing → criterion scoring → justification → finalisation
- **Spelling-aware partial credit** — misspelled keywords earn 50% of criterion points when `partial_credit_allowed: true`; 0% otherwise
- **4-bit quantization** — Qwen2-VL-7B loads in ~4 GB VRAM; auto-fallback to 2B model on CPU

### Plagiarism Detection
- Sentence-transformer semantic embeddings (all-MiniLM-L6-v2)
- Combined with Levenshtein character-level similarity to avoid flagging independent misspellings as HIGH
- Severity levels: HIGH / MEDIUM / LOW with per-student snippet preview

### TA Review Dashboard
- Cropped answer image shown side-by-side with AI grade, justification, and criterion breakdown
- Keyboard shortcuts: `A` to approve, `O` to override, `←→` to navigate
- Role-based access control: Instructor vs TA roles with protected routes

---

## Tech Stack

| Layer | Technology |
|---|---|
| OCR / Vision | Qwen2-VL-7B-Instruct (HuggingFace Transformers) |
| Grading Agent | LangGraph + LangChain + Ollama |
| Plagiarism | sentence-transformers + NumPy (FAISS for large exams) |
| PDF Processing | pdf2image + OpenCV |
| Backend | FastAPI + SQLAlchemy + SQLite/PostgreSQL |
| Frontend | React 18 + Tailwind CSS + Vite |
| Storage | Local filesystem (swappable to S3 via storage abstraction) |

---

## Project Structure

```
GradeOps/
├── gradeops_ml/
│   ├── grading/
│   │   ├── agent.py          # LangGraph 4-node grading pipeline
│   │   ├── schemas.py        # Pydantic models (rubric, grades, answers)
│   │   └── rubric_parser.py  # Rubric loading + prompt generation
│   ├── ocr/
│   │   ├── extractor.py      # Qwen2-VL inference + 4-bit quantization
│   │   └── preprocessor.py   # PDF→images, bbox cropping, deskewing
│   ├── plagiarism/
│   │   └── detector.py       # Semantic + character-level similarity
│   ├── utils/
│   │   ├── database.py       # SQLAlchemy ORM models
│   │   └── storage.py        # Local/S3 storage abstraction
│   ├── main.py               # FastAPI app, all endpoints
│   ├── pipeline.py           # End-to-end pipeline orchestrator
│   ├── config.py             # Pydantic settings from .env
│   └── requirements.txt
├── src/                      # React frontend (Vite)
│   ├── pages/
│   │   ├── TADashboard.jsx   # TA review queue
│   │   ├── GradePage.jsx     # Instructor: BBox + grading trigger
│   │   ├── UploadRubric.jsx
│   │   └── PlagiarismPage.jsx
│   ├── components/
│   │   ├── BBoxCanvas.jsx    # Interactive bounding box drawing
│   │   └── ProtectedRoute.jsx
│   └── context/
│       └── AuthContext.jsx
├── sample_rubric.json
├── .env.example
└── README.md
```

---

## Setup & Installation

### Prerequisites
- Python 3.11+
- Node.js 18+
- Poppler (for pdf2image): `winget install poppler` / `brew install poppler` / `apt install poppler-utils`
- Ollama running locally: [ollama.ai](https://ollama.ai)

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/GradeOps.git
cd GradeOps
```

### 2. Backend setup
```bash
cd gradeops_ml
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install bitsandbytes          # For 4-bit quantization (GPU only)
cp .env.example .env
# Edit .env with your settings
```

### 3. Pull the grading LLM via Ollama
```bash
ollama pull llama3.1              # or any model listed in .env
```

### 4. Start the backend
```bash
cd gradeops_ml
uvicorn main:app --reload --port 8000
```

### 5. Frontend setup
```bash
cd src
npm install
npm run dev                       # Runs on http://localhost:5173
```

### GPU note
If you have an NVIDIA GPU with 6 GB+ VRAM, the 7B model loads automatically with 4-bit quantization. On CPU, the code automatically switches to `Qwen2-VL-2B-Instruct`.

---

## Usage Walkthrough

### As Instructor
1. **Upload Rubric** — go to *Upload Rubric*, paste or upload your JSON rubric
2. **Upload Exams** — go to *Upload Exams*, select all student PDFs; page images are generated automatically
3. **Grade** — go to *Grade*, enter the Exam ID and Rubric ID; the preview auto-fills with the 300 DPI page image; draw bounding boxes around each question's answer area; click *Start Grading*
4. **Plagiarism** — go to *Plagiarism*, enter the Exam ID and load the report

### As TA
1. Go to `localhost:5173/ta`
2. Enter the Exam ID and click *Load*
3. Use `A` to approve, `O` to override (enter a score + comment), `←→` to navigate

### Rubric Format
```json
{
  "exam_name": "CS101 Midterm",
  "total_points": 50,
  "questions": [
    {
      "question_id": "Q1",
      "question_text": "Explain the difference between a stack and a queue.",
      "max_points": 10,
      "criteria": [
        {
          "criterion_id": "Q1_C1",
          "description": "Correct definition of a stack (LIFO)",
          "max_points": 5,
          "keywords": ["LIFO", "stack", "push", "pop"],
          "partial_credit_allowed": true
        }
      ]
    }
  ]
}
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/rubrics` | Upload a rubric |
| POST | `/api/exams/upload` | Upload student PDFs |
| GET | `/api/exams/{id}/students` | Get student page image URLs |
| POST | `/api/grade` | Trigger grading job |
| GET | `/api/grade/{job_id}` | Poll job status |
| GET | `/api/results/{exam_id}` | Get all graded answers |
| PATCH | `/api/results/approve/{id}` | TA approves a grade |
| PATCH | `/api/results/override` | TA overrides a grade |
| GET | `/api/plagiarism/{exam_id}` | Get plagiarism report |

Full interactive docs available at `http://localhost:8000/docs`.

---

## Configuration

Key `.env` variables:

```env
OCR_MODEL=Qwen/Qwen2-VL-7B-Instruct   # or 2B for CPU
OCR_DEVICE=cuda                         # or cpu
OLLAMA_MODEL=llama3.1
OLLAMA_BASE_URL=http://localhost:11434
GRADING_TEMPERATURE=0.1
EMBEDDING_MODEL=all-MiniLM-L6-v2
PLAGIARISM_SIMILARITY_THRESHOLD=0.85
LOCAL_STORAGE_PATH=./uploads
DATABASE_URL=sqlite:///./gradeops.db
```

---

## Known Limitations

- **Single-page exams only** — multi-page PDFs use the first page; multi-page support requires a question-to-page mapping extension
- **CPU performance** — the 2B model on CPU takes 2–4 minutes per student; a GPU is strongly recommended for batches larger than 5 students
- **Typed vs handwritten** — Qwen2-VL handles printed text well; very messy handwriting may return lower confidence scores
- **Rubric keywords** — grading quality improves significantly with more specific keywords per criterion

---

## License

MIT License — see [LICENSE](LICENSE) for details.
