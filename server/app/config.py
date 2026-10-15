import os
import re
from dataclasses import dataclass
from pathlib import Path

MAX_PROJECT_BYTES = 10 * 1024 * 1024
MAX_PHOTO_BYTES = 15 * 1024 * 1024

ORIGIN = re.compile(r"^https?://(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$")


def parse_origins(value: str) -> tuple[str, ...]:
    origins: list[str] = []
    for part in value.split(","):
        origin = part.strip().rstrip("/").lower()
        if not origin:
            continue
        if not ORIGIN.fullmatch(origin):
            raise ValueError(
                f"ROOMX_ALLOWED_ORIGINS: {part.strip()!r} is not an origin "
                "(expected scheme://host[:port], no path, no wildcard)"
            )
        if origin not in origins:
            origins.append(origin)
    return tuple(origins)


@dataclass(frozen=True)
class Config:
    token: str
    data: Path
    static: Path | None = None
    max_project_bytes: int = MAX_PROJECT_BYTES
    max_photo_bytes: int = MAX_PHOTO_BYTES
    allowed_origins: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        parse_origins(",".join(self.allowed_origins))

    @classmethod
    def from_env(cls) -> "Config":
        static = os.environ.get("ROOMX_STATIC", "").strip()
        return cls(
            token=os.environ.get("ROOMX_TOKEN", "").strip(),
            data=Path(os.environ.get("ROOMX_DATA", "").strip() or "/data"),
            static=Path(static) if static else None,
            allowed_origins=parse_origins(os.environ.get("ROOMX_ALLOWED_ORIGINS", "")),
        )
