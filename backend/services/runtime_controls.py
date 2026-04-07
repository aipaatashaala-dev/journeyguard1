import asyncio
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class TTLCache:
    """
    Thread-safe TTL + LRU cache.
    Average-case O(1) read/write for hot keys.
    """

    def __init__(self, max_size: int = 2048):
        self.max_size = max(64, int(max_size))
        self._items: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str, default: Any = None) -> Any:
        now = time.monotonic()
        with self._lock:
            entry = self._items.get(key)
            if not entry:
                return default
            if entry.expires_at <= now:
                self._items.pop(key, None)
                return default
            self._items.move_to_end(key)
            return entry.value

    def set(self, key: str, value: Any, ttl_seconds: float) -> Any:
        ttl = max(0.1, float(ttl_seconds))
        expires_at = time.monotonic() + ttl
        with self._lock:
            self._items[key] = _CacheEntry(value=value, expires_at=expires_at)
            self._items.move_to_end(key)
            self._evict_expired_locked()
            while len(self._items) > self.max_size:
                self._items.popitem(last=False)
        return value

    def pop(self, key: str, default: Any = None) -> Any:
        with self._lock:
            entry = self._items.pop(key, None)
            return entry.value if entry else default

    def _evict_expired_locked(self):
        now = time.monotonic()
        expired_keys = [key for key, entry in self._items.items() if entry.expires_at <= now]
        for key in expired_keys:
            self._items.pop(key, None)


class AsyncSingleFlight:
    """
    Deduplicates concurrent work for the same key.
    The first caller does the work; followers await the same result.
    """

    def __init__(self):
        self._futures_by_loop: dict[asyncio.AbstractEventLoop, dict[str, asyncio.Future]] = {}
        self._state_lock = threading.Lock()

    async def run(self, key: str, factory: Callable[[], Awaitable[Any]]) -> Any:
        loop = asyncio.get_running_loop()
        leader = False
        with self._state_lock:
            loop_futures = self._futures_by_loop.setdefault(loop, {})
            future = loop_futures.get(key)
            if future is None:
                future = loop.create_future()
                loop_futures[key] = future
                leader = True

        if not leader:
            return await future

        try:
            result = await factory()
            future.set_result(result)
            return result
        except Exception as exc:
            future.set_exception(exc)
            raise
        finally:
            with self._state_lock:
                loop_futures = self._futures_by_loop.get(loop)
                if loop_futures is not None:
                    loop_futures.pop(key, None)
                    if not loop_futures:
                        self._futures_by_loop.pop(loop, None)


@dataclass
class _BucketState:
    tokens: float
    updated_at: float


class TokenBucketLimiter:
    """
    Fast token-bucket rate limiter.
    O(1) average update per key.
    """

    def __init__(self, max_keys: int = 10000):
        self.max_keys = max(256, int(max_keys))
        self._buckets: OrderedDict[str, _BucketState] = OrderedDict()
        self._lock = threading.Lock()

    def allow(self, key: str, capacity: int, refill_per_second: float) -> tuple[bool, float]:
        now = time.monotonic()
        capacity = max(1, int(capacity))
        refill = max(0.001, float(refill_per_second))

        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _BucketState(tokens=float(capacity), updated_at=now)
                self._buckets[key] = bucket
            else:
                elapsed = max(0.0, now - bucket.updated_at)
                bucket.tokens = min(float(capacity), bucket.tokens + elapsed * refill)
                bucket.updated_at = now
                self._buckets.move_to_end(key)

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                self._trim_locked(now)
                return True, 0.0

            missing = 1.0 - bucket.tokens
            retry_after = missing / refill
            self._trim_locked(now)
            return False, retry_after

    def _trim_locked(self, now: float):
        idle_cutoff = now - 3600
        stale_keys = [
            key for key, bucket in self._buckets.items()
            if bucket.updated_at < idle_cutoff
        ]
        for key in stale_keys:
            self._buckets.pop(key, None)

        while len(self._buckets) > self.max_keys:
            self._buckets.popitem(last=False)
