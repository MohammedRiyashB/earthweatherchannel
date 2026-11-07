"""Bounded response cache for public, read-only weather API endpoints.

This is a zero-configuration first-stage cache. It is intentionally process-local:
it reduces duplicate provider work within one Render instance but is NOT a shared
cache across instances. A distributed cache can be added later without changing
public endpoint response bodies.
"""
from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any


@dataclass
class CachedResponse:
    expires_at: float
    status: int
    headers: list[tuple[bytes, bytes]]
    body: bytes


class PublicResponseCacheMiddleware:
    """Cache successful GET JSON responses for selected public API routes."""

    TTL_SECONDS = {
        "/api/weather": 60,
        "/api/weather/bulk": 60,
        "/api/weather/featured": 60,
        "/api/atmosphere": 300,
        "/api/wind-grid": 300,
        "/api/cyclones": 180,
        "/api/radar": 120,
        "/api/weather-news": 300,
        "/api/alerts": 30,
        "/api/sources": 600,
        "/api/satellites/catalog": 3600,
    }
    MAX_ENTRIES = 256
    MAX_BODY_BYTES = 1_000_000

    def __init__(self, app: Any) -> None:
        self.app = app
        self._cache: OrderedDict[str, CachedResponse] = OrderedDict()
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(scope: dict[str, Any]) -> str:
        path = scope.get("path", "")
        query = scope.get("query_string", b"")
        return path + ("?" + query.decode("latin-1") if query else "")

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope.get("method") != "GET":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        ttl = self.TTL_SECONDS.get(path)
        if ttl is None:
            await self.app(scope, receive, send)
            return

        key = self._key(scope)
        now = time.monotonic()
        async with self._lock:
            cached = self._cache.get(key)
            if cached and cached.expires_at > now:
                self._cache.move_to_end(key)
            elif cached:
                del self._cache[key]
                cached = None

        if cached is not None:
            headers = [
                (name, value) for name, value in cached.headers
                if name.lower() not in (b"content-length", b"cache-control", b"x-earth-cache")
            ]
            headers.extend([
                (b"content-length", str(len(cached.body)).encode("ascii")),
                (b"cache-control", f"public, max-age=0, s-maxage={ttl}, stale-while-revalidate=30".encode("ascii")),
                (b"x-earth-cache", b"HIT"),
            ])
            await send({"type": "http.response.start", "status": cached.status, "headers": headers})
            await send({"type": "http.response.body", "body": cached.body})
            return

        response_status = 500
        response_headers: list[tuple[bytes, bytes]] = []
        chunks: list[bytes] = []
        body_size = 0
        cacheable = True

        async def send_wrapper(message: dict[str, Any]) -> None:
            nonlocal response_status, response_headers, body_size, cacheable
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = list(message.get("headers", []))
                content_type = next(
                    (v for k, v in response_headers if k.lower() == b"content-type"),
                    b"",
                )
                cacheable = response_status == 200 and b"application/json" in content_type.lower()
                if cacheable:
                    response_headers = [
                        (k, v) for k, v in response_headers
                        if k.lower() not in (b"cache-control", b"x-earth-cache")
                    ]
                    response_headers.extend([
                        (b"cache-control", f"public, max-age=0, s-maxage={ttl}, stale-while-revalidate=30".encode("ascii")),
                        (b"x-earth-cache", b"MISS"),
                    ])
                await send({"type": "http.response.start", "status": response_status, "headers": response_headers})
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                body_size += len(body)
                if cacheable and body_size <= self.MAX_BODY_BYTES:
                    chunks.append(body)
                elif body_size > self.MAX_BODY_BYTES:
                    cacheable = False
                    chunks.clear()
                await send(message)
            else:
                await send(message)

        await self.app(scope, receive, send_wrapper)

        if cacheable and response_status == 200 and body_size <= self.MAX_BODY_BYTES:
            body = b"".join(chunks)
            stored_headers = [
                (k, v) for k, v in response_headers
                if k.lower() not in (b"content-length", b"x-earth-cache")
            ]
            async with self._lock:
                self._cache[key] = CachedResponse(
                    expires_at=time.monotonic() + ttl,
                    status=response_status,
                    headers=stored_headers,
                    body=body,
                )
                self._cache.move_to_end(key)
                while len(self._cache) > self.MAX_ENTRIES:
                    self._cache.popitem(last=False)
