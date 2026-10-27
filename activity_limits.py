"""Bounded, per-process admission for anonymous analytics, not authentication."""
import time
from collections import OrderedDict
from datetime import datetime, date

from config import KYIV


class ActivityLimits:
    def __init__(self, client_burst: int = 20, client_rate: float = 1, global_burst: int = 240,
                 global_rate: float = 120, daily_limit: int = 100000, client_daily_limit: int = 1000,
                 max_clients: int = 20000) -> None:
        self.client_burst, self.client_rate = client_burst, client_rate
        self.global_burst, self.global_rate = global_burst, global_rate
        self.daily_limit, self.client_daily_limit = daily_limit, client_daily_limit
        self.max_clients = max_clients
        self.clients = OrderedDict()
        self.tokens, self.updated = float(global_burst), time.monotonic()
        self.day, self.count = None, 0

    def check(self, uid: str, group: str, kind: str, now: float | None = None, day: date | None = None) -> str:
        now = time.monotonic() if now is None else now
        day = day or datetime.now(KYIV).date()
        if day != self.day:
            self.day, self.count = day, 0
            self.clients.clear()
        client = self.clients.get(uid)
        if client is None:
            client = {'tokens': float(self.client_burst), 'updated': now, 'count': 0, 'recent': OrderedDict()}
        recent = client['recent']
        key = (group, kind)
        interval = {'interaction': 2, 'refresh': 60}.get(kind, 10)
        if key in recent and now - recent[key] < interval:
            return 'duplicate'
        self.tokens = min(self.global_burst, self.tokens + max(0, now-self.updated)*self.global_rate)
        self.updated = now
        client['tokens'] = min(self.client_burst, client['tokens'] + max(0, now-client['updated'])*self.client_rate)
        client['updated'] = now
        if self.count >= self.daily_limit or client['count'] >= self.client_daily_limit or self.tokens < 1 or client['tokens'] < 1:
            return 'limited'
        self.tokens -= 1
        client['tokens'] -= 1
        self.count += 1
        client['count'] += 1
        recent[key] = now
        recent.move_to_end(key)
        if len(recent) > 16:
            recent.popitem(last=False)
        self.clients[uid] = client
        self.clients.move_to_end(uid)
        if len(self.clients) > self.max_clients:
            self.clients.popitem(last=False)
        return 'accepted'

    def forget(self, uid: str, group: str, kind: str) -> None:
        client = self.clients.get(uid)
        if client:
            client['recent'].pop((group, kind), None)
