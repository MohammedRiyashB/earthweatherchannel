import unittest
from collections import OrderedDict

from app.runtime_cache import prune_expired_lru


class RuntimeCacheTests(unittest.TestCase):
    def test_removes_expired_entries_and_keeps_live_entries(self):
        cache = OrderedDict([
            ("expired", (9.0, "old")),
            ("live", (12.0, "fresh")),
        ])

        prune_expired_lru(cache, now=10.0, max_entries=10)

        self.assertEqual(list(cache.items()), [("live", (12.0, "fresh"))])

    def test_evicts_least_recently_used_entries_when_over_capacity(self):
        cache = OrderedDict([
            ("least-recent", (50.0, 1)),
            ("recent", (50.0, 2)),
            ("newest", (50.0, 3)),
        ])

        prune_expired_lru(cache, now=10.0, max_entries=2)

        self.assertEqual(list(cache.keys()), ["recent", "newest"])

    def test_removes_expired_entries_before_capacity_eviction(self):
        cache = OrderedDict([
            ("expired", (1.0, 0)),
            ("recent", (30.0, 1)),
            ("newest", (30.0, 2)),
        ])

        prune_expired_lru(cache, now=5.0, max_entries=2)

        self.assertEqual(list(cache.keys()), ["recent", "newest"])

    def test_rejects_zero_or_negative_capacity(self):
        with self.assertRaises(ValueError):
            prune_expired_lru(OrderedDict(), now=0.0, max_entries=0)
        with self.assertRaises(ValueError):
            prune_expired_lru(OrderedDict(), now=0.0, max_entries=-1)


if __name__ == "__main__":
    unittest.main()
