"""Small helpers for bounded process-local caches used by provider adapters."""
from __future__ import annotations

from collections import OrderedDict
from typing import TypeVar

Key = TypeVar("Key")
Value = TypeVar("Value")


def prune_expired_lru(
    cache: OrderedDict[Key, tuple[float, Value]],
    now: float,
    max_entries: int,
) -> None:
    """Remove expired entries, then evict least-recently-used entries above the limit.

    Cache values store their monotonic expiry timestamp in tuple position zero.
    The caller should move a cache hit to the end before returning it.
    """
    if max_entries < 1:
        raise ValueError("max_entries must be at least one")

    for key, (expires_at, _) in list(cache.items()):
        if expires_at <= now:
            cache.pop(key, None)

    while len(cache) > max_entries:
        cache.popitem(last=False)
