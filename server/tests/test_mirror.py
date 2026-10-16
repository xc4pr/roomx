import hashlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import mirror

from .conftest import AUTH, TOKEN

JOB = "abcdefghij_-"
SECRET = "A" * 43
OTHER = "B" * 43
DAY = 24 * 3600 * 1000
NOW = 1_700_000_000_000
RECEIPT = "c" * 64


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def box_body(secret: str = SECRET, expires: int = NOW + DAY) -> dict[str, Any]:
    return {"mailbox": digest(secret.encode()), "expiresAt": expires}


def mbox(secret: str = SECRET) -> dict[str, str]:
    return {"X-Roomx-Mailbox": secret}


def receipt(value: str = RECEIPT) -> dict[str, str]:
    return {**AUTH, "X-Roomx-Receipt": value}


@pytest.fixture(autouse=True)
def clock(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    state = {"now": NOW}
    monkeypatch.setattr(mirror, "now_ms", lambda: state["now"])
    return state


@pytest.fixture
def box(client: TestClient) -> TestClient:
    assert client.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body()).status_code == 201
    return client


def upload(client: TestClient, data: bytes, secret: str = SECRET, job: str = JOB) -> Any:
    return client.put(
        f"/api/mirror/{job}/shots/{digest(data)}",
        headers=mbox(secret),
        content=data,
    )


def test_create_idempotent_and_conflict(client: TestClient) -> None:
    url = f"/api/mirror/{JOB}"
    assert client.put(url, headers=AUTH, json=box_body()).status_code == 201
    assert client.put(url, headers=AUTH, json=box_body()).status_code == 200
    assert client.put(url, headers=AUTH, json=box_body(OTHER)).status_code == 409


def test_create_validation(client: TestClient) -> None:
    url = f"/api/mirror/{JOB}"
    assert (
        client.put(url, headers=AUTH, json=box_body(expires=NOW + 8 * DAY + 1)).status_code == 400
    )
    assert client.put(url, headers=AUTH, json=box_body(expires=NOW - 1)).status_code == 400
    assert client.put(url, headers=AUTH, json=box_body(expires=NOW + 8 * DAY)).status_code == 201
    assert (
        client.put(url, headers=AUTH, json={"mailbox": "xyz", "expiresAt": NOW + 1}).status_code
        == 400
    )
    assert client.put(url, headers=AUTH, json={"mailbox": digest(b"x")}).status_code == 400
    assert client.put(url, headers=AUTH, content=b"nope").status_code == 400
    assert client.put(url, headers=AUTH, json=[1]).status_code == 400


def test_box_limit(make_client: Callable[..., TestClient]) -> None:
    client = make_client(mirror_max_boxes=2)
    for job in ("aaaaaaaaaaa1", "aaaaaaaaaaa2"):
        assert client.put(f"/api/mirror/{job}", headers=AUTH, json=box_body()).status_code == 201
    assert client.put("/api/mirror/aaaaaaaaaaa3", headers=AUTH, json=box_body()).status_code == 409
    assert client.put("/api/mirror/aaaaaaaaaaa1", headers=AUTH, json=box_body()).status_code == 200


def test_roundtrip(box: TestClient) -> None:
    data = b"ciphertext-1"
    first = upload(box, data)
    assert first.status_code == 201
    assert upload(box, data).status_code == 200
    listing = box.get(f"/api/mirror/{JOB}/shots", headers=AUTH)
    assert listing.json() == [{"id": digest(data), "size": len(data)}]
    got = box.get(f"/api/mirror/{JOB}/shots/{digest(data)}", headers=AUTH)
    assert got.content == data
    assert got.headers["content-type"] == "application/octet-stream"
    assert got.headers["x-content-type-options"] == "nosniff"
    shot_url = f"/api/mirror/{JOB}/shots/{digest(data)}"
    assert box.delete(shot_url, headers=receipt()).status_code == 200
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []
    assert upload(box, data).status_code == 200
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []
    placed = box.get(f"/api/mirror/{JOB}/placed", headers=mbox())
    assert placed.json() == {
        "placed": [digest(data)],
        "receipts": {digest(data): RECEIPT},
        "expiresAt": NOW + DAY,
    }
    assert box.delete(f"/api/mirror/{JOB}/shots/{digest(data)}", headers=AUTH).status_code == 200
    assert box.delete(f"/api/mirror/{JOB}/shots/{digest(b'zz')}", headers=AUTH).status_code == 404
    assert box.get(f"/api/mirror/{JOB}/shots/{digest(b'zz')}", headers=AUTH).status_code == 404


def test_wrong_or_missing_secret(box: TestClient) -> None:
    data = b"abc"
    assert upload(box, data, OTHER).status_code == 401
    assert upload(box, data, "short").status_code == 401
    missing = box.put(f"/api/mirror/{JOB}/shots/{digest(data)}", content=data)
    assert missing.status_code == 401
    assert box.get(f"/api/mirror/{JOB}/placed").status_code == 401
    assert box.get(f"/api/mirror/{JOB}/placed", headers=mbox(OTHER)).status_code == 401
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []


def test_hash_mismatch(box: TestClient) -> None:
    response = box.put(f"/api/mirror/{JOB}/shots/{digest(b'x')}", headers=mbox(), content=b"y")
    assert response.status_code == 400
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []


def test_unknown_box(client: TestClient) -> None:
    assert upload(client, b"a").status_code == 404
    assert client.get(f"/api/mirror/{JOB}/shots", headers=AUTH).status_code == 404
    assert client.get(f"/api/mirror/{JOB}/placed", headers=mbox()).status_code == 404
    assert client.delete(f"/api/mirror/{JOB}", headers=AUTH).json() == {"deleted": False}


def test_size_limit(make_client: Callable[..., TestClient]) -> None:
    client = make_client(mirror_max_shot_bytes=10)
    client.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body())
    assert upload(client, b"x" * 10).status_code == 201
    assert upload(client, b"x" * 11).status_code == 413


def test_count_and_total_limits(make_client: Callable[..., TestClient]) -> None:
    client = make_client(mirror_max_shots=2, mirror_max_bytes=20)
    client.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body())
    assert upload(client, b"a" * 8).status_code == 201
    assert upload(client, b"b" * 8).status_code == 201
    assert upload(client, b"c").status_code == 409
    assert upload(client, b"a" * 8).status_code == 200
    other = "bbbbbbbbbbbb"
    client.put(f"/api/mirror/{other}", headers=AUTH, json=box_body())
    assert upload(client, b"d" * 21, job=other).status_code == 409


def test_default_limits() -> None:
    from app.config import Config

    config = Config(token=TOKEN, data=Path("."))
    assert config.mirror_max_shot_bytes == 16 * 1024 * 1024 + 64 * 1024
    assert config.mirror_max_shots == 500
    assert config.mirror_max_bytes == 1536 * 1024 * 1024
    assert config.mirror_max_boxes == 100
    assert config.mirror_max_total_bytes == 5 * 1024**3
    assert config.mirror_max_ttl_ms == 8 * DAY


def test_expiry(box: TestClient, clock: dict[str, int], tmp_path: Path) -> None:
    upload(box, b"a")
    clock["now"] = NOW + DAY
    assert upload(box, b"b").status_code == 410
    assert not (tmp_path / "data" / "mirror" / JOB).exists()
    assert upload(box, b"b").status_code == 404


def test_expiry_on_token_endpoints(box: TestClient, clock: dict[str, int]) -> None:
    clock["now"] = NOW + DAY + 1
    assert box.get(f"/api/mirror/{JOB}/placed", headers=mbox()).status_code == 410
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).status_code == 404


def test_expired_swept_at_start_and_on_create(
    make_client: Callable[..., TestClient], clock: dict[str, int], tmp_path: Path
) -> None:
    client = make_client()
    client.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body())
    clock["now"] = NOW + 2 * DAY
    client.put("/api/mirror/cccccccccccc", headers=AUTH, json=box_body(expires=NOW + 3 * DAY))
    mirror_dir = tmp_path / "data" / "mirror"
    assert sorted(p.name for p in mirror_dir.iterdir()) == ["cccccccccccc"]
    clock["now"] = NOW + 4 * DAY
    make_client()
    assert list(mirror_dir.iterdir()) == []


def test_recreate_after_expiry_is_empty(box: TestClient, clock: dict[str, int]) -> None:
    upload(box, b"a")
    clock["now"] = NOW + 2 * DAY
    assert (
        box.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body(OTHER, NOW + 3 * DAY)).status_code
        == 201
    )
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []


def test_delete_job_removes_files(box: TestClient, tmp_path: Path) -> None:
    upload(box, b"a")
    path = tmp_path / "data" / "mirror" / JOB
    assert path.exists()
    assert box.delete(f"/api/mirror/{JOB}", headers=AUTH).json() == {"deleted": True}
    assert [p.name for p in path.rglob("*")] == ["meta.json"]
    assert upload(box, b"a").status_code == 410


def test_stored_ciphertext_only(box: TestClient, tmp_path: Path) -> None:
    upload(box, b"a")
    files = [p for p in (tmp_path / "data" / "mirror" / JOB).rglob("*") if p.is_file()]
    assert SECRET.encode() not in b"".join(p.read_bytes() for p in files)
    assert not any(p.name.startswith(".tmp-") for p in files)


@pytest.mark.parametrize(
    "job", ["short", "x" * 13, "abc..defghij", "abcdefghij%2e%2e", "abcdefghij.."]
)
def test_bad_job_ids(client: TestClient, job: str) -> None:
    assert client.put(f"/api/mirror/{job}", headers=AUTH, json=box_body()).status_code in (400, 404)
    assert client.delete(f"/api/mirror/{job}", headers=AUTH).status_code in (400, 404)
    assert client.get(f"/api/mirror/{job}/shots", headers=AUTH).status_code in (400, 404)


def test_bad_job_id_status(client: TestClient) -> None:
    assert client.put("/api/mirror/short", headers=AUTH, json=box_body()).status_code == 400
    assert client.get("/api/mirror/short/placed", headers=mbox()).status_code == 400


@pytest.mark.parametrize("shot", ["abc", "A" * 64, "../" + "a" * 61, "a" * 63 + "/"])
def test_bad_shot_ids(box: TestClient, shot: str) -> None:
    assert box.put(f"/api/mirror/{JOB}/shots/{shot}", headers=mbox(), content=b"x").status_code in (
        400,
        401,
        404,
        405,
    )
    assert box.get(f"/api/mirror/{JOB}/shots/{shot}", headers=AUTH).status_code in (
        400,
        401,
        404,
        405,
    )
    assert box.delete(f"/api/mirror/{JOB}/shots/{shot}", headers=AUTH).status_code in (
        400,
        401,
        404,
        405,
    )


def test_bad_shot_id_status(box: TestClient) -> None:
    assert box.put(f"/api/mirror/{JOB}/shots/abc", headers=mbox(), content=b"x").status_code == 400


def test_sync_endpoints_need_token(box: TestClient) -> None:
    data = b"a"
    upload(box, data)
    shot = digest(data)
    bad = {"Authorization": "Bearer wrong"}
    calls = [
        ("put", f"/api/mirror/{JOB}"),
        ("delete", f"/api/mirror/{JOB}"),
        ("get", f"/api/mirror/{JOB}/shots"),
        ("get", f"/api/mirror/{JOB}/shots/{shot}"),
        ("delete", f"/api/mirror/{JOB}/shots/{shot}"),
    ]
    for method, url in calls:
        assert getattr(box, method)(url).status_code == 401
        assert getattr(box, method)(url, headers=bad).status_code == 401
        assert getattr(box, method)(url, headers=mbox()).status_code == 401
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == [{"id": shot, "size": 1}]


def test_cors_allows_mirror(make_client: Callable[..., TestClient]) -> None:
    client = make_client(allowed_origins=("https://app.example",))
    response = client.options(
        f"/api/mirror/{JOB}/shots/{digest(b'a')}",
        headers={
            "Origin": "https://app.example",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "x-roomx-mailbox,content-type",
        },
    )
    assert response.status_code == 200
    assert "x-roomx-mailbox" in response.headers["access-control-allow-headers"].lower()
    delete = client.options(
        f"/api/mirror/{JOB}",
        headers={
            "Origin": "https://app.example",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert delete.status_code == 200
    assert "DELETE" in delete.headers["access-control-allow-methods"]


def test_server_total_limit(make_client: Callable[..., TestClient]) -> None:
    client = make_client(mirror_max_total_bytes=20)
    other = "bbbbbbbbbbbb"
    client.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body())
    client.put(f"/api/mirror/{other}", headers=AUTH, json=box_body())
    assert upload(client, b"a" * 12).status_code == 201
    full = upload(client, b"b" * 12, job=other)
    assert full.status_code == 409
    assert full.json()["detail"] == "server full"
    assert upload(client, b"c" * 8, job=other).status_code == 201


def test_receipt_is_stored_and_returned(box: TestClient) -> None:
    first, second = b"r1", b"r2"
    upload(box, first)
    upload(box, second)
    url = f"/api/mirror/{JOB}/shots/"
    assert box.delete(url + digest(first), headers=receipt()).json() == {"deleted": True}
    assert box.delete(url + digest(second), headers=receipt("d" * 64)).status_code == 200
    assert box.delete(url + digest(second), headers=receipt("d" * 64)).status_code == 200
    placed = box.get(f"/api/mirror/{JOB}/placed", headers=mbox()).json()
    assert placed["placed"] == [digest(first), digest(second)]
    assert placed["receipts"] == {digest(first): RECEIPT, digest(second): "d" * 64}
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []


def test_delete_without_receipt_only_discards(box: TestClient) -> None:
    data = b"unreadable"
    upload(box, data)
    url = f"/api/mirror/{JOB}/shots/{digest(data)}"
    assert box.delete(url, headers=AUTH).status_code == 200
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == []
    placed = box.get(f"/api/mirror/{JOB}/placed", headers=mbox()).json()
    assert placed == {"placed": [], "receipts": {}, "expiresAt": NOW + DAY}
    assert box.delete(url, headers=AUTH).status_code == 404


@pytest.mark.parametrize("value", ["", "abc", "C" * 64, "c" * 63, "c" * 65, "g" * 64])
def test_invalid_receipt(box: TestClient, value: str) -> None:
    data = b"kept"
    upload(box, data)
    url = f"/api/mirror/{JOB}/shots/{digest(data)}"
    response = box.delete(url, headers=receipt(value))
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid receipt"
    assert box.get(f"/api/mirror/{JOB}/shots", headers=AUTH).json() == [
        {"id": digest(data), "size": len(data)}
    ]
    assert box.get(f"/api/mirror/{JOB}/placed", headers=mbox()).json()["receipts"] == {}


def test_old_meta_without_receipts(client: TestClient, tmp_path: Path) -> None:
    old = digest(b"old")
    path = tmp_path / "data" / "mirror" / JOB
    path.mkdir(parents=True)
    (path / "meta.json").write_text(
        json.dumps({"mailbox": digest(SECRET.encode()), "expiresAt": NOW + DAY, "placed": [old]})
    )
    placed = client.get(f"/api/mirror/{JOB}/placed", headers=mbox())
    assert placed.json() == {"placed": [old], "receipts": {}, "expiresAt": NOW + DAY}
    data = b"new"
    assert upload(client, data).status_code == 201
    url = f"/api/mirror/{JOB}/shots/{digest(data)}"
    assert client.delete(url, headers=receipt()).status_code == 200
    placed = client.get(f"/api/mirror/{JOB}/placed", headers=mbox())
    assert placed.json()["receipts"] == {digest(data): RECEIPT}
    assert placed.json()["placed"] == [old, digest(data)]


def test_ended_job_answers_410(box: TestClient) -> None:
    data = b"a"
    upload(box, data)
    shot = digest(data)
    assert box.delete(f"/api/mirror/{JOB}", headers=AUTH).json() == {"deleted": True}
    responses = [
        upload(box, b"b"),
        upload(box, data),
        box.get(f"/api/mirror/{JOB}/placed", headers=mbox()),
        box.get(f"/api/mirror/{JOB}/shots", headers=AUTH),
        box.get(f"/api/mirror/{JOB}/shots/{shot}", headers=AUTH),
        box.delete(f"/api/mirror/{JOB}/shots/{shot}", headers=AUTH),
        box.delete(f"/api/mirror/{JOB}/shots/{shot}", headers=receipt()),
        box.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body()),
        box.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body(OTHER)),
    ]
    for response in responses:
        assert (response.status_code, response.json()["detail"]) == (410, "ended")
    assert box.get(f"/api/mirror/{JOB}/placed").status_code == 401
    assert box.get(f"/api/mirror/{JOB}/placed", headers=mbox(OTHER)).status_code == 401
    assert upload(box, b"b", OTHER).status_code == 401
    assert box.get(f"/api/mirror/{JOB}/shots").status_code == 401
    assert box.delete(f"/api/mirror/{JOB}", headers=AUTH).json() == {"deleted": False}
    assert box.get(f"/api/mirror/{JOB}/placed", headers=mbox()).status_code == 410


def test_ended_job_expires_like_a_mailbox(box: TestClient, clock: dict[str, int]) -> None:
    box.delete(f"/api/mirror/{JOB}", headers=AUTH)
    clock["now"] = NOW + DAY
    expired = box.get(f"/api/mirror/{JOB}/placed", headers=mbox())
    assert (expired.status_code, expired.json()["detail"]) == (410, "expired")
    assert box.get(f"/api/mirror/{JOB}/placed", headers=mbox()).status_code == 404


def test_tombstone_swept_after_expiry(
    make_client: Callable[..., TestClient], clock: dict[str, int], tmp_path: Path
) -> None:
    client = make_client()
    client.put(f"/api/mirror/{JOB}", headers=AUTH, json=box_body())
    client.delete(f"/api/mirror/{JOB}", headers=AUTH)
    mirror_dir = tmp_path / "data" / "mirror"
    clock["now"] = NOW + DAY - 1
    make_client()
    assert [p.name for p in mirror_dir.iterdir()] == [JOB]
    clock["now"] = NOW + DAY
    make_client()
    assert list(mirror_dir.iterdir()) == []


def test_tombstones_do_not_count(make_client: Callable[..., TestClient]) -> None:
    client = make_client(mirror_max_boxes=2, mirror_max_total_bytes=20)
    first, second, third = "aaaaaaaaaaa1", "aaaaaaaaaaa2", "aaaaaaaaaaa3"
    for job in (first, second):
        assert client.put(f"/api/mirror/{job}", headers=AUTH, json=box_body()).status_code == 201
    assert upload(client, b"a" * 12, job=first).status_code == 201
    assert client.put(f"/api/mirror/{third}", headers=AUTH, json=box_body()).status_code == 409
    assert upload(client, b"b" * 12, job=second).status_code == 409
    client.delete(f"/api/mirror/{first}", headers=AUTH)
    assert client.put(f"/api/mirror/{third}", headers=AUTH, json=box_body()).status_code == 201
    assert upload(client, b"b" * 12, job=second).status_code == 201
    assert client.put(f"/api/mirror/{first}", headers=AUTH, json=box_body()).status_code == 410
