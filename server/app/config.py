import os
from dataclasses import dataclass
from pathlib import Path

MAX_PROJECT_BYTES = 10 * 1024 * 1024
MAX_PHOTO_BYTES = 15 * 1024 * 1024


@dataclass(frozen=True)
class Config:
    token: str
    data: Path
    static: Path | None = None
    max_project_bytes: int = MAX_PROJECT_BYTES
    max_photo_bytes: int = MAX_PHOTO_BYTES

    @classmethod
    def from_env(cls) -> "Config":
        static = os.environ.get("ROOMX_STATIC", "").strip()
        return cls(
            token=os.environ.get("ROOMX_TOKEN", "").strip(),
            data=Path(os.environ.get("ROOMX_DATA", "").strip() or "/data"),
            static=Path(static) if static else None,
        )
