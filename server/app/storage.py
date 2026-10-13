import json
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Any

ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,64}")
HASH_PATTERN = re.compile(r"[0-9a-f]{64}")


def valid_id(value: str) -> bool:
    return ID_PATTERN.fullmatch(value) is not None


def valid_hash(value: str) -> bool:
    return HASH_PATTERN.fullmatch(value) is not None


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class Store:
    def __init__(self, data: Path) -> None:
        self.projects_dir = data / "projects"
        self.photos_dir = data / "photos"
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.photos_dir.mkdir(parents=True, exist_ok=True)
        self._guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}

    def lock(self, project_id: str) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(project_id, threading.Lock())

    def project_path(self, project_id: str) -> Path:
        return self.projects_dir / f"{project_id}.json"

    def photo_path(self, digest: str) -> Path:
        return self.photos_dir / f"{digest}.jpg"

    def read_project(self, project_id: str) -> dict[str, Any] | None:
        try:
            raw = self.project_path(project_id).read_bytes()
        except FileNotFoundError:
            return None
        document = json.loads(raw)
        return document if isinstance(document, dict) else None

    def write_project(self, project_id: str, project: dict[str, Any]) -> None:
        write_atomic(
            self.project_path(project_id),
            json.dumps(project, ensure_ascii=False, separators=(",", ":")).encode(),
        )

    def list_projects(self) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        for path in sorted(self.projects_dir.glob("*.json")):
            try:
                document = json.loads(path.read_bytes())
            except (OSError, ValueError):
                continue
            if not isinstance(document, dict) or document.get("id") != path.stem:
                continue
            entries.append(
                {
                    "id": path.stem,
                    "name": document.get("name", ""),
                    "rev": document.get("rev", 0),
                    "updatedAt": document.get("updatedAt", ""),
                    "deleted": document.get("deleted") is True,
                }
            )
        return entries

    def has_photo(self, digest: str) -> bool:
        return self.photo_path(digest).is_file()

    def write_photo(self, digest: str, data: bytes) -> bool:
        path = self.photo_path(digest)
        if path.is_file():
            return False
        write_atomic(path, data)
        return True
