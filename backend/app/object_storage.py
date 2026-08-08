from __future__ import annotations

from pathlib import Path
from typing import Protocol

from .config import Settings


class ObjectStore(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...

    def healthy(self) -> bool: ...


def _safe_key(key: str) -> str:
    candidate = Path(key)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError("Unsafe object-storage key")
    return candidate.as_posix()


class LocalObjectStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / _safe_key(key)).resolve()
        if self.root not in path.parents:
            raise ValueError("Object-storage key escaped its configured root")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> None:
        del content_type
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        path.unlink(missing_ok=True)

    def healthy(self) -> bool:
        return self.root.exists() and self.root.is_dir()


class S3ObjectStore:
    def __init__(self, settings: Settings):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("Install boto3 to use S3-compatible object storage.") from exc
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=_safe_key(key), Body=data, ContentType=content_type)

    def get(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=_safe_key(key))
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=_safe_key(key))

    def healthy(self) -> bool:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            return False
        return True


def build_object_store(settings: Settings) -> ObjectStore:
    if settings.object_storage_backend.lower() == "s3":
        return S3ObjectStore(settings)
    return LocalObjectStore(settings.object_storage_root)
