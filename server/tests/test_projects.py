import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AUTH


def project(pid: str = "p1", **extra: Any) -> dict[str, Any]:
    return {
        "id": pid,
        "name": "Wohnung",
        "rev": 0,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        **extra,
    }


def put(client: TestClient, pid: str, base_rev: int, doc: dict[str, Any]) -> Any:
    return client.put(
        f"/api/projects/{pid}", headers=AUTH, json={"baseRev": base_rev, "project": doc}
    )


def test_empty_list(client: TestClient) -> None:
    assert client.get("/api/projects", headers=AUTH).json() == []


def test_create_assigns_rev_one(client: TestClient) -> None:
    response = put(client, "p1", 0, project())
    assert response.status_code == 200
    assert response.json()["rev"] == 1
    fetched = client.get("/api/projects/p1", headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.json() == response.json()


def test_update_increments_rev(client: TestClient) -> None:
    put(client, "p1", 0, project())
    response = put(client, "p1", 1, project(name="Neu"))
    assert response.status_code == 200
    assert response.json()["rev"] == 2
    assert response.json()["name"] == "Neu"


def test_list_summaries(client: TestClient) -> None:
    put(client, "p1", 0, project("p1"))
    put(client, "p2", 0, project("p2", name="Büro"))
    listing = client.get("/api/projects", headers=AUTH).json()
    assert listing == [
        {
            "id": "p1",
            "name": "Wohnung",
            "rev": 1,
            "updatedAt": "2026-01-01T00:00:00.000Z",
            "deleted": False,
        },
        {
            "id": "p2",
            "name": "Büro",
            "rev": 1,
            "updatedAt": "2026-01-01T00:00:00.000Z",
            "deleted": False,
        },
    ]


def test_conflict_returns_server_state(client: TestClient) -> None:
    put(client, "p1", 0, project(name="A"))
    put(client, "p1", 1, project(name="B"))
    response = put(client, "p1", 1, project(name="C"))
    assert response.status_code == 409
    assert response.json()["name"] == "B"
    assert response.json()["rev"] == 2
    assert client.get("/api/projects/p1", headers=AUTH).json()["name"] == "B"


def test_create_with_stale_base_rev_conflicts_when_existing(client: TestClient) -> None:
    put(client, "p1", 0, project())
    assert put(client, "p1", 0, project(name="Other")).status_code == 409


def test_unknown_project_with_nonzero_base_rev_is_not_found(client: TestClient) -> None:
    assert put(client, "p1", 3, project()).status_code == 404


def test_missing_project(client: TestClient) -> None:
    assert client.get("/api/projects/nope", headers=AUTH).status_code == 404


def test_tombstone_is_kept_and_listed(client: TestClient) -> None:
    put(client, "p1", 0, project(rooms=[{"id": "r"}]))
    response = put(client, "p1", 1, project(deleted=True, rooms=[]))
    assert response.status_code == 200
    assert response.json()["deleted"] is True
    listing = client.get("/api/projects", headers=AUTH).json()
    assert listing[0]["deleted"] is True
    assert listing[0]["rev"] == 2
    assert client.get("/api/projects/p1", headers=AUTH).json()["deleted"] is True


@pytest.mark.parametrize("pid", ["a b", "a.b", "x" * 65, "ä", "a%20b"])
def test_invalid_ids_are_rejected(client: TestClient, pid: str) -> None:
    assert put(client, pid, 0, project(pid)).status_code == 400
    assert client.get(f"/api/projects/{pid}", headers=AUTH).status_code == 400


@pytest.mark.parametrize(
    "url",
    [
        "/api/projects/..%2F..%2Fetc%2Fpasswd",
        "/api/projects/../x",
        "/api/projects/%2e%2e",
        "/api/projects/..",
        "/api/projects/a/b",
    ],
)
def test_traversal_ids_never_reach_the_filesystem(client: TestClient, url: str) -> None:
    response = client.get(url, headers=AUTH)
    assert response.status_code in (400, 404, 200)
    if response.status_code == 200:
        assert isinstance(response.json(), list)
    response = client.put(url, headers=AUTH, json={"baseRev": 0, "project": project("x")})
    assert response.status_code in (400, 404, 405)


def test_traversal_writes_nothing_outside_data(tmp_path: Path, client: TestClient) -> None:
    client.put(
        "/api/projects/..%2Fescape",
        headers=AUTH,
        json={"baseRev": 0, "project": project("../escape")},
    )
    assert not list(tmp_path.glob("**/escape*"))


def test_body_validation(client: TestClient) -> None:
    url = "/api/projects/p1"
    assert client.put(url, headers=AUTH, content=b"not json").status_code == 400
    assert client.put(url, headers=AUTH, json=[1]).status_code == 400
    assert client.put(url, headers=AUTH, json={"project": project()}).status_code == 400
    assert put(client, "p1", -1, project()).status_code == 400
    assert put(client, "p1", True, project()).status_code == 400  # type: ignore[arg-type]
    assert put(client, "p1", "0", project()).status_code == 400  # type: ignore[arg-type]
    assert client.put(url, headers=AUTH, json={"baseRev": 0, "project": []}).status_code == 400
    assert put(client, "p1", 0, project("other")).status_code == 400


def test_project_size_limit(make_client: Callable[..., TestClient]) -> None:
    client = make_client(max_project_bytes=2000)
    assert put(client, "p1", 0, project()).status_code == 200
    big = project(notes="x" * 5000)
    assert put(client, "p2", 0, big).status_code == 413


def test_project_size_limit_without_content_length(
    make_client: Callable[..., TestClient],
) -> None:
    client = make_client(max_project_bytes=2000)
    payload = json.dumps({"baseRev": 0, "project": project(notes="x" * 5000)})

    def chunks() -> Any:
        yield payload[:100].encode()
        yield payload[100:].encode()

    response = client.put("/api/projects/p1", headers=AUTH, content=chunks())
    assert response.status_code == 413


def test_files_are_stored_as_json_in_data_dir(tmp_path: Path, client: TestClient) -> None:
    put(client, "p1", 0, project())
    stored = json.loads((tmp_path / "data" / "projects" / "p1.json").read_text())
    assert stored["rev"] == 1
    assert not list((tmp_path / "data" / "projects").glob(".tmp-*"))


def test_corrupt_files_are_skipped_in_listing(tmp_path: Path, client: TestClient) -> None:
    put(client, "p1", 0, project())
    (tmp_path / "data" / "projects" / "broken.json").write_text("{")
    assert [entry["id"] for entry in client.get("/api/projects", headers=AUTH).json()] == ["p1"]
