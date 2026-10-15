from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.server import create_app

TOKEN = "secret-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def make_static(root: Path) -> Path:
    (root / "_app" / "immutable").mkdir(parents=True)
    (root / "index.html").write_text("<html>app</html>")
    (root / "service-worker.js").write_text("self")
    (root / "manifest.webmanifest").write_text("{}")
    (root / "icon.png").write_bytes(b"png")
    (root / "_app" / "immutable" / "entry.js").write_text("export {}")
    return root


@pytest.fixture
def make_client(tmp_path: Path) -> Callable[..., TestClient]:
    def build(static: Path | None = None, **overrides: Any) -> TestClient:
        config = Config(token=TOKEN, data=tmp_path / "data", static=static, **overrides)
        return TestClient(create_app(config))

    return build


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


@pytest.fixture
def static_client(make_client: Callable[..., TestClient], tmp_path: Path) -> TestClient:
    return make_client(make_static(tmp_path / "static"))
