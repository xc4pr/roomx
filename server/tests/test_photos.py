import hashlib
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AUTH

JPEG = {**AUTH, "Content-Type": "image/jpeg"}


def jpeg(payload: bytes = b"photo") -> tuple[bytes, str]:
    data = b"\xff\xd8\xff" + payload
    return data, hashlib.sha256(data).hexdigest()


def test_upload_head_and_download(client: TestClient) -> None:
    data, digest = jpeg()
    assert client.head(f"/api/photos/{digest}", headers=AUTH).status_code == 404
    created = client.put(f"/api/photos/{digest}", headers=JPEG, content=data)
    assert created.status_code == 201
    assert client.head(f"/api/photos/{digest}", headers=AUTH).status_code == 200
    fetched = client.get(f"/api/photos/{digest}", headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == data
    assert fetched.headers["content-type"] == "image/jpeg"
    assert "immutable" in fetched.headers["cache-control"]


def test_upload_is_idempotent(tmp_path: Path, client: TestClient) -> None:
    data, digest = jpeg()
    assert client.put(f"/api/photos/{digest}", headers=JPEG, content=data).status_code == 201
    again = client.put(f"/api/photos/{digest}", headers=JPEG, content=data)
    assert again.status_code == 200
    assert (tmp_path / "data" / "photos" / f"{digest}.jpg").read_bytes() == data
    assert not list((tmp_path / "data" / "photos").glob(".tmp-*"))


def test_hash_mismatch_is_rejected(tmp_path: Path, client: TestClient) -> None:
    data, _ = jpeg()
    other = hashlib.sha256(b"other").hexdigest()
    response = client.put(f"/api/photos/{other}", headers=JPEG, content=data)
    assert response.status_code == 400
    assert not (tmp_path / "data" / "photos" / f"{other}.jpg").exists()


def test_wrong_content_type(client: TestClient) -> None:
    data, digest = jpeg()
    response = client.put(
        f"/api/photos/{digest}", headers={**AUTH, "Content-Type": "text/plain"}, content=data
    )
    assert response.status_code == 415


def test_photo_size_limit(make_client: Callable[..., TestClient]) -> None:
    client = make_client(max_photo_bytes=1000)
    data, digest = jpeg(b"x" * 2000)
    assert client.put(f"/api/photos/{digest}", headers=JPEG, content=data).status_code == 413
    small, small_digest = jpeg(b"x" * 100)
    assert client.put(f"/api/photos/{small_digest}", headers=JPEG, content=small).status_code == 201


def test_default_photo_limit_is_15_mb(client: TestClient) -> None:
    data, digest = jpeg(b"x" * (15 * 1024 * 1024))
    assert client.put(f"/api/photos/{digest}", headers=JPEG, content=data).status_code == 413


@pytest.mark.parametrize(
    "digest",
    ["abc", "A" * 64, "g" * 64, "a" * 63, "a" * 65, "%2e%2e", "a" * 60 + ".jpg"],
)
def test_invalid_hash(client: TestClient, digest: str) -> None:
    assert client.get(f"/api/photos/{digest}", headers=AUTH).status_code == 400
    assert client.head(f"/api/photos/{digest}", headers=AUTH).status_code == 400
    assert client.put(f"/api/photos/{digest}", headers=JPEG, content=b"x").status_code == 400


def test_traversal_paths(tmp_path: Path, client: TestClient) -> None:
    response = client.put("/api/photos/..%2F..%2Fevil", headers=JPEG, content=b"x")
    assert response.status_code in (400, 404, 405)
    assert not list(tmp_path.glob("**/evil*"))


def test_unknown_photo(client: TestClient) -> None:
    assert client.get(f"/api/photos/{'0' * 64}", headers=AUTH).status_code == 404
