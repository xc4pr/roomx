from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Config, parse_origins
from tests.conftest import AUTH

FOREIGN = "https://evil.example"
OWN = "https://roomx.example"


def preflight(client: TestClient, origin: str):
    return client.options(
        "/api/projects/p1",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


def test_default_allows_no_foreign_origin(client: TestClient) -> None:
    response = preflight(client, FOREIGN)
    assert "access-control-allow-origin" not in response.headers
    assert response.status_code != 200
    simple = client.get("/api/projects", headers={**AUTH, "Origin": FOREIGN})
    assert simple.status_code == 200
    assert "access-control-allow-origin" not in simple.headers


def test_same_origin_needs_no_cors(client: TestClient) -> None:
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/projects", headers=AUTH).status_code == 200


def test_configured_origin_is_answered_and_others_are_not(
    make_client: Callable[..., TestClient],
) -> None:
    client = make_client(allowed_origins=(OWN,))
    response = preflight(client, OWN)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == OWN
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
    own = client.get("/api/projects", headers={**AUTH, "Origin": OWN})
    assert own.headers["access-control-allow-origin"] == OWN
    foreign = preflight(client, FOREIGN)
    assert "access-control-allow-origin" not in foreign.headers
    assert foreign.status_code == 400
    other = client.get("/api/projects", headers={**AUTH, "Origin": FOREIGN})
    assert "access-control-allow-origin" not in other.headers


def test_origins_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ROOMX_TOKEN", "abc")
    monkeypatch.setenv(
        "ROOMX_ALLOWED_ORIGINS", " https://One.example/ , http://localhost:5173,https://one.example"
    )
    config = Config.from_env()
    assert config.allowed_origins == ("https://one.example", "http://localhost:5173")
    monkeypatch.setenv("ROOMX_ALLOWED_ORIGINS", "")
    assert Config.from_env().allowed_origins == ()


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "https://*.example",
        "roomx.example",
        "https://roomx.example/app",
        "ftp://a.example",
        "null",
    ],
)
def test_anything_but_an_origin_is_refused(value: str, tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="ROOMX_ALLOWED_ORIGINS"):
        parse_origins(value)
    with pytest.raises(ValueError, match="ROOMX_ALLOWED_ORIGINS"):
        Config(token="t", data=tmp_path, allowed_origins=(value,))


def test_environment_with_a_wildcard_stops_the_server(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ROOMX_TOKEN", "abc")
    monkeypatch.setenv("ROOMX_ALLOWED_ORIGINS", "*")
    with pytest.raises(ValueError, match="not an origin"):
        Config.from_env()
