import asyncio
import hashlib
import hmac
import json
import mimetypes
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import __version__
from .config import Config
from .storage import Store, valid_hash, valid_id

mimetypes.add_type("application/manifest+json", ".webmanifest")

NO_CACHE = "no-cache"
IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATED = {"index.html", "service-worker.js", "manifest.webmanifest"}


def error(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


async def read_limited(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise error(413, "payload too large")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise error(413, "payload too large")
        chunks.append(chunk)
    return b"".join(chunks)


def create_app(config: Config) -> FastAPI:
    if not config.token:
        raise RuntimeError("ROOMX_TOKEN is not set")
    store = Store(config.data)
    token = config.token.encode()
    app = FastAPI(title="roomx", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "HEAD", "PUT"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    def authorize(request: Request) -> None:
        header = request.headers.get("authorization", "")
        scheme, _, supplied = header.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(supplied.strip().encode(), token):
            raise HTTPException(
                status_code=401,
                detail="unauthorized",
                headers={"WWW-Authenticate": "Bearer"},
            )

    secured = [Depends(authorize)]

    def project_id(value: str) -> str:
        if not valid_id(value):
            raise error(400, "invalid id")
        return value

    def photo_hash(value: str) -> str:
        if not valid_hash(value):
            raise error(400, "invalid hash")
        return value

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.get("/api/projects", dependencies=secured)
    async def list_projects() -> list[dict[str, Any]]:
        return await asyncio.to_thread(store.list_projects)

    @app.get("/api/projects/{pid}", dependencies=secured)
    async def get_project(pid: str) -> dict[str, Any]:
        project = await asyncio.to_thread(store.read_project, project_id(pid))
        if project is None:
            raise error(404, "not found")
        return project

    @app.put("/api/projects/{pid}", dependencies=secured)
    async def put_project(pid: str, request: Request) -> Response:
        pid = project_id(pid)
        raw = await read_limited(request, config.max_project_bytes)
        try:
            body = json.loads(raw)
        except ValueError:
            raise error(400, "invalid json") from None
        if not isinstance(body, dict):
            raise error(400, "body must be an object")
        base_rev = body.get("baseRev")
        project = body.get("project")
        if not isinstance(base_rev, int) or isinstance(base_rev, bool) or base_rev < 0:
            raise error(400, "invalid baseRev")
        if not isinstance(project, dict) or project.get("id") != pid:
            raise error(400, "project id mismatch")

        def write() -> tuple[int, dict[str, Any]]:
            with store.lock(pid):
                current = store.read_project(pid)
                if current is None:
                    if base_rev != 0:
                        return 404, {"detail": "not found"}
                    next_rev = 1
                else:
                    stored_rev = current.get("rev", 0)
                    if stored_rev != base_rev:
                        return 409, current
                    next_rev = stored_rev + 1
                saved = {**project, "rev": next_rev}
                store.write_project(pid, saved)
                return 200, saved

        status, payload = await asyncio.to_thread(write)
        return JSONResponse(payload, status_code=status)

    @app.api_route("/api/photos/{digest}", methods=["HEAD"], dependencies=secured)
    async def head_photo(digest: str) -> Response:
        found = await asyncio.to_thread(store.has_photo, photo_hash(digest))
        if not found:
            raise error(404, "not found")
        return Response(status_code=200, headers={"Content-Type": "image/jpeg"})

    @app.get("/api/photos/{digest}", dependencies=secured)
    async def get_photo(digest: str) -> Response:
        path = store.photo_path(photo_hash(digest))
        try:
            data = await asyncio.to_thread(path.read_bytes)
        except FileNotFoundError:
            raise error(404, "not found") from None
        return Response(data, media_type="image/jpeg", headers={"Cache-Control": IMMUTABLE})

    @app.put("/api/photos/{digest}", dependencies=secured)
    async def put_photo(digest: str, request: Request) -> Response:
        digest = photo_hash(digest)
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "image/jpeg":
            raise error(415, "content type must be image/jpeg")
        data = await read_limited(request, config.max_photo_bytes)
        if hashlib.sha256(data).hexdigest() != digest:
            raise error(400, "hash mismatch")
        created = await asyncio.to_thread(store.write_photo, digest, data)
        return JSONResponse(
            {"hash": digest, "created": created}, status_code=201 if created else 200
        )

    static_root = config.static.resolve() if config.static else None

    def static_file(relative: str) -> Path | None:
        if static_root is None:
            return None
        candidate = (static_root / relative).resolve()
        if candidate.is_relative_to(static_root) and candidate.is_file():
            return candidate
        return None

    def serve(path: Path, relative: str) -> FileResponse:
        cache = IMMUTABLE if relative.startswith("_app/immutable/") else NO_CACHE
        if relative in REVALIDATED:
            cache = NO_CACHE
        return FileResponse(path, headers={"Cache-Control": cache})

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str) -> Response:
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "not found"}, status_code=404)
        if static_root is None:
            return JSONResponse({"detail": "not found"}, status_code=404)
        relative = path.strip("/") or "index.html"
        found = static_file(relative)
        if found is not None:
            return serve(found, relative)
        if "." in relative.rsplit("/", 1)[-1]:
            return JSONResponse({"detail": "not found"}, status_code=404)
        index = static_file("index.html")
        if index is None:
            return JSONResponse({"detail": "not found"}, status_code=404)
        return serve(index, "index.html")

    return app
