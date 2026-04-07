import asyncio
import threading

import httpx


_client_lock = threading.Lock()
_shared_clients: dict[asyncio.AbstractEventLoop, httpx.AsyncClient] = {}
_slow_lane_clients: dict[asyncio.AbstractEventLoop, httpx.AsyncClient] = {}


async def get_shared_http_client() -> httpx.AsyncClient:
    loop = asyncio.get_running_loop()
    existing = _shared_clients.get(loop)
    if existing is not None:
        return existing

    with _client_lock:
        existing = _shared_clients.get(loop)
        if existing is None:
            existing = httpx.AsyncClient(
                timeout=httpx.Timeout(12.0, connect=5.0),
                limits=httpx.Limits(max_connections=120, max_keepalive_connections=40),
            )
            _shared_clients[loop] = existing
    return existing


async def get_slow_lane_http_client() -> httpx.AsyncClient:
    loop = asyncio.get_running_loop()
    existing = _slow_lane_clients.get(loop)
    if existing is not None:
        return existing

    with _client_lock:
        existing = _slow_lane_clients.get(loop)
        if existing is None:
            existing = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=6.0),
                limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
                follow_redirects=True,
            )
            _slow_lane_clients[loop] = existing
    return existing


async def close_shared_http_clients():
    loop = asyncio.get_running_loop()
    shared_client = None
    slow_lane_client = None

    with _client_lock:
        shared_client = _shared_clients.pop(loop, None)
        slow_lane_client = _slow_lane_clients.pop(loop, None)

    if shared_client is not None:
        await shared_client.aclose()
    if slow_lane_client is not None:
        await slow_lane_client.aclose()
