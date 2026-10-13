from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import AUTH


def test_index_is_served_without_cache(static_client: TestClient) -> None:
    response = static_client.get("/")
    assert response.status_code == 200
    assert response.text == "<html>app</html>"
    assert response.headers["cache-control"] == "no-cache"


def test_revalidated_files(static_client: TestClient) -> None:
    for path in ("/index.html", "/service-worker.js", "/manifest.webmanifest"):
        response = static_client.get(path)
        assert response.status_code == 200, path
        assert response.headers["cache-control"] == "no-cache", path
    assert "manifest" in static_client.get("/manifest.webmanifest").headers["content-type"]


def test_immutable_assets(static_client: TestClient) -> None:
    response = static_client.get("/_app/immutable/entry.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_other_files_revalidate(static_client: TestClient) -> None:
    response = static_client.get("/icon.png")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


def test_spa_fallback(static_client: TestClient) -> None:
    for path in ("/p/abc", "/settings", "/p/abc/3d"):
        response = static_client.get(path)
        assert response.status_code == 200, path
        assert response.text == "<html>app</html>"
        assert response.headers["cache-control"] == "no-cache"


def test_missing_asset_is_404(static_client: TestClient) -> None:
    assert static_client.get("/_app/immutable/missing.js").status_code == 404
    assert static_client.get("/nope.png").status_code == 404


def test_api_is_never_answered_by_fallback(static_client: TestClient) -> None:
    for path in ("/api", "/api/", "/api/unknown", "/api/projects/x/y"):
        response = static_client.get(path, headers=AUTH)
        assert response.status_code == 404, path
        assert response.headers["content-type"].startswith("application/json")


def test_static_traversal(static_client: TestClient) -> None:
    for path in ("/../conftest.py", "/%2e%2e/%2e%2e/etc/passwd", "/..%2f..%2fetc/passwd"):
        response = static_client.get(path)
        assert response.text in ("<html>app</html>",) or response.status_code == 404


def test_without_static_everything_else_is_404(client: TestClient) -> None:
    assert client.get("/").status_code == 404
    assert client.get("/p/abc").status_code == 404


def test_missing_index_is_404(make_client: Callable[..., TestClient], tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    assert make_client(empty).get("/p/abc").status_code == 404
