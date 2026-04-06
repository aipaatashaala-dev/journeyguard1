import asyncio
from typing import Optional

import httpx


_client_lock = asyncio.Lock()
_shared_client: Optional[httpx.AsyncClient] = None
_slow_lane_client: Optional[httpx.AsyncClient] = None


async def get_shared_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is not None:
        return _shared_client

    async with _client_lock:
        if _shared_client is None:
            _shared_client = httpx.AsyncClient(
                timeout=httpx.Timeout(12.0, connect=5.0),
                limits=httpx.Limits(max_connections=120, max_keepalive_connections=40),
            )
    return _shared_client


async def get_slow_lane_http_client() -> httpx.AsyncClient:
    global _slow_lane_client
    if _slow_lane_client is not None:
        return _slow_lane_client

    async with _client_lock:
        if _slow_lane_client is None:
            _slow_lane_client = httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=6.0),
                limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
                follow_redirects=True,
            )
    return _slow_lane_client


async def close_shared_http_clients():
    global _shared_client, _slow_lane_client
    async with _client_lock:
        if _shared_client is not None:
            await _shared_client.aclose()
            _shared_client = None
        if _slow_lane_client is not None:
            await _slow_lane_client.aclose()
            _slow_lane_client = None
