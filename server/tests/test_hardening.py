import hashlib
import logging
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.config import Config
from app.server import create_app
from tests.conftest import AUTH


def nosniff(response: Response) -> bool:
    headers = response.headers
    return headers.get("x-content-type-options") == "nosniff" and headers.get("x-frame-options") == "DENY"


def test_nosniff_on_static_and_api(static_client: TestClient) -> None:
    for path in ("/", "/icon.png", "/_app/immutable/entry.js", "/nope.png", "/api/health"):
        assert nosniff(static_client.get(path)), path


def test_nosniff_on_project_and_photo_responses(client: TestClient) -> None:
    project = {"id": "p1", "name": "x"}
    body = {"baseRev": 0, "project": project}
    assert nosniff(client.put("/api/projects/p1", json=body, headers=AUTH))
    assert nosniff(client.get("/api/projects/p1", headers=AUTH))
    assert nosniff(client.get("/api/projects", headers=AUTH))

    data = b"\xff\xd8\xff photo"
    digest = hashlib.sha256(data).hexdigest()
    upload = {**AUTH, "Content-Type": "image/jpeg"}
    assert nosniff(client.put(f"/api/photos/{digest}", content=data, headers=upload))
    got = client.get(f"/api/photos/{digest}", headers=AUTH)
    assert got.content == data
    assert nosniff(got)
    assert nosniff(client.head(f"/api/photos/{digest}", headers=AUTH))


def test_nosniff_on_errors(client: TestClient) -> None:
    response = client.get("/api/projects")
    assert response.status_code == 401
    assert nosniff(response)


@pytest.fixture
def build(tmp_path: Path) -> Callable[[str], TestClient]:
    return lambda token: TestClient(create_app(Config(token=token, data=tmp_path / "data")))


def test_short_token_warns_but_starts(
    build: Callable[[str], TestClient], caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="roomx"):
        client = build("short")
    assert client.get("/api/health").status_code == 200
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert "32" in text
    assert "secrets.token_urlsafe(32)" in text


def test_long_token_does_not_warn(
    build: Callable[[str], TestClient], caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="roomx"):
        build("x" * 32)
    assert not caplog.records


def test_token_value_is_never_logged(
    build: Callable[[str], TestClient], caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="roomx"):
        build("hunter2")
    assert "hunter2" not in caplog.text
