import asyncio
import hashlib
import hmac
import json
import re
import shutil
import threading
import time
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from .config import Config
from .storage import valid_hash, write_atomic

JOB_PATTERN = re.compile(r"[A-Za-z0-9_-]{12}")
SECRET_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}")
META = "meta.json"


def now_ms() -> int:
    return int(time.time() * 1000)


def secret_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


class Gone(Exception):
    pass


class MirrorStore:
    def __init__(self, data: Path) -> None:
        self.root = data / "mirror"
        self.root.mkdir(parents=True, exist_ok=True)
        self._guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}
        self.total_lock = threading.Lock()
        self.sweep()

    def lock(self, job: str) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(job, threading.Lock())

    def job_dir(self, job: str) -> Path:
        return self.root / job

    def shot_path(self, job: str, shot: str) -> Path:
        return self.job_dir(job) / "shots" / f"{shot}.bin"

    def read_meta(self, job: str) -> dict[str, Any] | None:
        try:
            meta = json.loads((self.job_dir(job) / META).read_bytes())
        except (OSError, ValueError):
            return None
        if (
            not isinstance(meta, dict)
            or not isinstance(meta.get("mailbox"), str)
            or not isinstance(meta.get("expiresAt"), int)
            or not isinstance(meta.get("placed"), list)
        ):
            return None
        return meta

    def write_meta(self, job: str, meta: dict[str, Any]) -> None:
        write_atomic(
            self.job_dir(job) / META,
            json.dumps(meta, separators=(",", ":")).encode(),
        )

    def remove(self, job: str) -> bool:
        path = self.job_dir(job)
        existed = path.exists()
        shutil.rmtree(path, ignore_errors=True)
        return existed

    def jobs(self) -> list[str]:
        try:
            return [
                p.name for p in self.root.iterdir() if p.is_dir() and JOB_PATTERN.fullmatch(p.name)
            ]
        except OSError:
            return []

    def sweep(self) -> None:
        for job in self.jobs():
            with self.lock(job):
                meta = self.read_meta(job)
                if meta is None or meta["expiresAt"] <= now_ms():
                    self.remove(job)

    def load(self, job: str) -> dict[str, Any] | None:
        meta = self.read_meta(job)
        if meta is None:
            return None
        if meta["expiresAt"] <= now_ms():
            self.remove(job)
            raise Gone
        return meta

    def shots(self, job: str) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        try:
            for path in sorted((self.job_dir(job) / "shots").glob("*.bin")):
                if valid_hash(path.stem):
                    found.append({"id": path.stem, "size": path.stat().st_size})
        except OSError:
            pass
        return found


def register(
    app: Any,
    config: Config,
    authorize: Callable[[Request], None],
    read_limited: Callable[[Request, int], Coroutine[Any, Any, bytes]],
) -> None:
    store = MirrorStore(config.data)
    router = APIRouter(prefix="/api/mirror")
    secured = [Depends(authorize)]

    def error(status: int, detail: str) -> HTTPException:
        return HTTPException(status_code=status, detail=detail)

    def job_id(value: str) -> str:
        if JOB_PATTERN.fullmatch(value) is None:
            raise error(400, "invalid id")
        return value

    def shot_id(value: str) -> str:
        if not valid_hash(value):
            raise error(400, "invalid hash")
        return value

    def check_secret(meta: dict[str, Any], request: Request) -> None:
        supplied = request.headers.get("x-roomx-mailbox", "")
        if SECRET_PATTERN.fullmatch(supplied) is None or not hmac.compare_digest(
            secret_hash(supplied).encode(), meta["mailbox"].encode()
        ):
            raise error(401, "unauthorized")

    def load(job: str) -> dict[str, Any]:
        try:
            meta = store.load(job)
        except Gone:
            raise error(410, "expired") from None
        if meta is None:
            raise error(404, "not found")
        return meta

    @router.put("/{job}", dependencies=secured)
    async def put_job(job: str, request: Request) -> Response:
        job = job_id(job)
        raw = await read_limited(request, 4096)
        try:
            body = json.loads(raw)
        except ValueError:
            raise error(400, "invalid json") from None
        if not isinstance(body, dict):
            raise error(400, "body must be an object")
        mailbox = body.get("mailbox")
        expires = body.get("expiresAt")
        if not isinstance(mailbox, str) or not valid_hash(mailbox):
            raise error(400, "invalid mailbox")
        if not isinstance(expires, int) or isinstance(expires, bool):
            raise error(400, "invalid expiresAt")

        def write() -> tuple[int, dict[str, Any]]:
            now = now_ms()
            if expires <= now or expires > now + config.mirror_max_ttl_ms:
                return 400, {"detail": "invalid expiresAt"}
            store.sweep()
            with store.lock(job):
                meta = store.read_meta(job)
                if meta is not None and meta["expiresAt"] > now:
                    if not hmac.compare_digest(meta["mailbox"].encode(), mailbox.encode()):
                        return 409, {"detail": "mailbox exists"}
                    meta["expiresAt"] = expires
                    store.write_meta(job, meta)
                    return 200, {"expiresAt": expires}
                if len(store.jobs()) >= config.mirror_max_boxes and meta is None:
                    return 409, {"detail": "too many mailboxes"}
                store.remove(job)
                store.write_meta(job, {"mailbox": mailbox, "expiresAt": expires, "placed": []})
                return 201, {"expiresAt": expires}

        status, payload = await asyncio.to_thread(write)
        return JSONResponse(payload, status_code=status)

    @router.delete("/{job}", dependencies=secured)
    async def delete_job(job: str) -> dict[str, bool]:
        job = job_id(job)

        def remove() -> bool:
            with store.lock(job):
                return store.remove(job)

        return {"deleted": await asyncio.to_thread(remove)}

    @router.put("/{job}/shots/{shot}")
    async def put_shot(job: str, shot: str, request: Request) -> Response:
        job = job_id(job)
        shot = shot_id(shot)

        def check() -> None:
            check_secret(load(job), request)

        await asyncio.to_thread(check)
        data = await read_limited(request, config.mirror_max_shot_bytes)
        if hashlib.sha256(data).hexdigest() != shot:
            raise error(400, "hash mismatch")

        def write() -> tuple[int, dict[str, Any]]:
            with store.lock(job):
                try:
                    meta = store.load(job)
                except Gone:
                    return 410, {"detail": "expired"}
                if meta is None:
                    return 404, {"detail": "not found"}
                if shot in meta["placed"] or store.shot_path(job, shot).is_file():
                    return 200, {"id": shot, "created": False}
                existing = store.shots(job)
                if len(existing) >= config.mirror_max_shots:
                    return 409, {"detail": "too many shots"}
                if sum(item["size"] for item in existing) + len(data) > config.mirror_max_bytes:
                    return 409, {"detail": "mailbox full"}
                with store.total_lock:
                    used = sum(i["size"] for j in store.jobs() for i in store.shots(j))
                    if used + len(data) > config.mirror_max_total_bytes:
                        return 409, {"detail": "server full"}
                    write_atomic(store.shot_path(job, shot), data)
                return 201, {"id": shot, "created": True}

        status, payload = await asyncio.to_thread(write)
        return JSONResponse(payload, status_code=status)

    @router.get("/{job}/shots", dependencies=secured)
    async def list_shots(job: str) -> list[dict[str, Any]]:
        job = job_id(job)

        def listing() -> list[dict[str, Any]]:
            with store.lock(job):
                load(job)
                return store.shots(job)

        return await asyncio.to_thread(listing)

    @router.get("/{job}/shots/{shot}", dependencies=secured)
    async def get_shot(job: str, shot: str) -> Response:
        job = job_id(job)
        shot = shot_id(shot)

        def read() -> bytes:
            load(job)
            try:
                return store.shot_path(job, shot).read_bytes()
            except FileNotFoundError:
                raise error(404, "not found") from None

        data = await asyncio.to_thread(read)
        return Response(data, media_type="application/octet-stream")

    @router.delete("/{job}/shots/{shot}", dependencies=secured)
    async def delete_shot(job: str, shot: str) -> dict[str, bool]:
        job = job_id(job)
        shot = shot_id(shot)

        def remove() -> None:
            with store.lock(job):
                meta = load(job)
                path = store.shot_path(job, shot)
                if not path.is_file() and shot not in meta["placed"]:
                    raise error(404, "not found")
                if shot not in meta["placed"]:
                    meta["placed"].append(shot)
                    store.write_meta(job, meta)
                path.unlink(missing_ok=True)

        await asyncio.to_thread(remove)
        return {"deleted": True}

    @router.get("/{job}/placed")
    async def placed(job: str, request: Request) -> dict[str, Any]:
        job = job_id(job)

        def read() -> dict[str, Any]:
            meta = load(job)
            check_secret(meta, request)
            return {"placed": list(meta["placed"]), "expiresAt": meta["expiresAt"]}

        return await asyncio.to_thread(read)

    app.include_router(router)
