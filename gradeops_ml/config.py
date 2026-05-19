"""
config.py – Centralised settings loaded from .env
All modules import `settings` from here.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"
    secret_key: str = "change-me"
    allowed_origins: str = "http://localhost:3000"

    # DB
    database_url: str = "postgresql://postgres:password@localhost:5432/gradeops"

    # Storage
    storage_backend: str = "local"           # "local" or "s3"
    local_storage_path: str = "./uploads"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "gradeops-exams"

    # OCR
    ocr_model: str = "Qwen/Qwen2-VL-7B-Instruct"
    ocr_device: str = "cpu"                  # changed to cpu for dev
    ocr_max_new_tokens: int = 2048

    # Grading LLM
    openai_api_key: str = ""
    grading_llm_model: str = "gpt-4o"
    grading_temperature: float = 0.1
    grading_max_tokens: int = 1024

    # Plagiarism
    plagiarism_similarity_threshold: float = 0.88
    embedding_model: str = "all-MiniLM-L6-v2"

    # Ollama (free local LLM)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    grading_temperature: float = 0.1

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
