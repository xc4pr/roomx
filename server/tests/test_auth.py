from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.server import create_app
from tests.conftest import AUTH


def test_health_needs_no_token(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str)


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong"},
        {"Authorization": "Bearer "},
        {"Authorization": "secret-token"},
        {"Authorization": "Basic secret-token"},
    ],
)
def test_api_rejects_bad_tokens(client: TestClient, headers: dict[str, str]) -> None:
    for method, url in [
        ("GET", "/api/projects"),
        ("GET", "/api/projects/abc"),
        ("PUT", "/api/projects/abc"),
        ("HEAD", f"/api/photos/{'a' * 64}"),
        ("GET", f"/api/photos/{'a' * 64}"),
        ("PUT", f"/api/photos/{'a' * 64}"),
    ]:
        response = client.request(method, url, headers=headers)
        assert response.status_code == 401, (method, url)


def test_valid_token_is_accepted(client: TestClient) -> None:
    assert client.get("/api/projects", headers=AUTH).status_code == 200


def test_server_refuses_to_start_without_token(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError):
        create_app(Config(token="", data=tmp_path))


def test_config_reads_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ROOMX_TOKEN", " abc ")
    monkeypatch.delenv("ROOMX_DATA", raising=False)
    monkeypatch.delenv("ROOMX_STATIC", raising=False)
    config = Config.from_env()
    assert config.token == "abc"
    assert config.data == Path("/data")
    assert config.static is None
    monkeypatch.setenv("ROOMX_DATA", "/x")
    monkeypatch.setenv("ROOMX_STATIC", "/y")
    config = Config.from_env()
    assert config.data == Path("/x")
    assert config.static == Path("/y")


def test_app_factory_fixture(make_client: Callable[..., TestClient]) -> None:
    assert make_client().get("/api/health").status_code == 200


def test_cors_preflight_for_cross_origin_clients(client: TestClient) -> None:
    response = client.options(
        "/api/projects/p1",
        headers={
            "Origin": "https://app.example",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
