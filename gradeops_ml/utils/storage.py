"""
utils/storage.py – Abstract file storage for local disk and AWS S3.

Usage:
    storage = get_storage()
    url = await storage.save_file(b"...", "exams/s001/Q1.png", "image/png")
    data = await storage.load_file("exams/s001/Q1.png")
"""
from __future__ import annotations
import os
import io
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

import aiofiles
from loguru import logger

from config import settings


class BaseStorage(ABC):
    @abstractmethod
    async def save_file(
        self, data: bytes | BinaryIO, key: str, content_type: str = "application/octet-stream"
    ) -> str:
        """Save data and return a URL/path to access the file."""

    @abstractmethod
    async def load_file(self, key: str) -> bytes:
        """Load and return raw bytes for a stored key."""

    @abstractmethod
    def public_url(self, key: str) -> str:
        """Return the public-facing URL for a stored file."""


# ─────────────────────────────────────────────────────────────────
# Local disk storage
# ─────────────────────────────────────────────────────────────────

class LocalStorage(BaseStorage):
    def __init__(self, base_dir: str = "./uploads"):
        self.base = Path(base_dir)
        self.base.mkdir(parents=True, exist_ok=True)

    async def save_file(
        self, data: bytes | BinaryIO, key: str, content_type: str = "application/octet-stream"
    ) -> str:
        dest = self.base / key
        dest.parent.mkdir(parents=True, exist_ok=True)

        raw = data.read() if hasattr(data, "read") else data  # type: ignore
        async with aiofiles.open(dest, "wb") as f:
            await f.write(raw)

        logger.debug(f"[LocalStorage] Saved {len(raw)} bytes → {dest}")
        return str(dest)

    async def load_file(self, key: str) -> bytes:
        dest = self.base / key
        if not dest.exists():
            raise FileNotFoundError(f"Storage key not found: {key}")
        async with aiofiles.open(dest, "rb") as f:
            return await f.read()

    def public_url(self, key: str) -> str:
        return f"/files/{key}"


# ─────────────────────────────────────────────────────────────────
# AWS S3 storage
# ─────────────────────────────────────────────────────────────────

class S3Storage(BaseStorage):
    def __init__(self):
        import boto3
        self.bucket = settings.s3_bucket_name
        self.region = settings.aws_region
        self.s3 = boto3.client(
            "s3",
            region_name=self.region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

    async def save_file(
        self, data: bytes | BinaryIO, key: str, content_type: str = "application/octet-stream"
    ) -> str:
        raw = data.read() if hasattr(data, "read") else data  # type: ignore
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=raw,
            ContentType=content_type,
        )
        url = self.public_url(key)
        logger.debug(f"[S3Storage] Uploaded {len(raw)} bytes → s3://{self.bucket}/{key}")
        return url

    async def load_file(self, key: str) -> bytes:
        resp = self.s3.get_object(Bucket=self.bucket, Key=key)
        return resp["Body"].read()

    def public_url(self, key: str) -> str:
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"


# ─────────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────────

_storage_instance: BaseStorage | None = None


def get_storage() -> BaseStorage:
    global _storage_instance
    if _storage_instance is None:
        if settings.storage_backend == "s3":
            _storage_instance = S3Storage()
            logger.info("Storage backend: AWS S3")
        else:
            _storage_instance = LocalStorage(settings.local_storage_path)
            logger.info(f"Storage backend: Local ({settings.local_storage_path})")
    return _storage_instance
