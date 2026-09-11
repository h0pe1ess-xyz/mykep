import aiosqlite
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = str(Path(__file__).resolve().parent / "schedule.db")


async def init_analytics_db() -> None:
    """Create the analytics table if it doesn't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                uid TEXT,
                group_name TEXT,
                endpoint TEXT,
                user_agent TEXT
            )
        ''')
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_analytics_timestamp 
            ON analytics(timestamp)
        ''')
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_analytics_uid 
            ON analytics(uid)
        ''')
        await db.commit()
    logger.info("Analytics DB initialized.")


async def log_request(
    uid: Optional[str],
    group_name: str,
    endpoint: str,
    user_agent: str = ""
) -> None:
    """Log a single API request to the analytics table."""
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO analytics (timestamp, uid, group_name, endpoint, user_agent) "
                "VALUES (?, ?, ?, ?, ?)",
                (now, uid or "", group_name, endpoint, user_agent)
            )
            await db.commit()
    except Exception as e:
        logger.warning(f"Failed to log analytics: {e}")


def _parse_platform(ua: str) -> str:
    """Determine platform from user-agent string."""
    ua_lower = ua.lower()
    if "iphone" in ua_lower or "ipad" in ua_lower:
        return "iOS"
    if "android" in ua_lower:
        return "Android"
    if "macintosh" in ua_lower or "mac os" in ua_lower:
        return "macOS"
    if "windows" in ua_lower:
        return "Windows"
    if "linux" in ua_lower:
        return "Linux"
    return "Other"


async def get_today_stats() -> Dict[str, Any]:
    """Get today's summary: requests, unique users, top groups."""
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        row = await db.execute_fetchall(
            "SELECT COUNT(*) as cnt FROM analytics WHERE timestamp LIKE ?",
            (f"{today}%",)
        )
        total_requests = row[0][0] if row else 0

        row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT uid) as cnt FROM analytics "
            "WHERE timestamp LIKE ? AND uid != ''",
            (f"{today}%",)
        )
        unique_users = row[0][0] if row else 0

        rows = await db.execute_fetchall(
            "SELECT group_name, COUNT(*) as cnt FROM analytics "
            "WHERE timestamp LIKE ? AND group_name != '' "
            "GROUP BY group_name ORDER BY cnt DESC LIMIT 5",
            (f"{today}%",)
        )
        top_groups = [(r[0], r[1]) for r in rows]

    return {
        "date": today,
        "total_requests": total_requests,
        "unique_users": unique_users,
        "top_groups": top_groups
    }


async def get_week_stats() -> List[Dict[str, Any]]:
    """Get daily breakdown for the last 7 days."""
    results = []
    for i in range(6, -1, -1):
        day = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        async with aiosqlite.connect(DB_PATH) as db:
            row = await db.execute_fetchall(
                "SELECT COUNT(*) FROM analytics WHERE timestamp LIKE ?",
                (f"{day}%",)
            )
            requests = row[0][0] if row else 0

            row = await db.execute_fetchall(
                "SELECT COUNT(DISTINCT uid) FROM analytics "
                "WHERE timestamp LIKE ? AND uid != ''",
                (f"{day}%",)
            )
            users = row[0][0] if row else 0

        results.append({"date": day, "requests": requests, "users": users})
    return results


async def get_top_groups(limit: int = 10) -> List[tuple]:
    """Get top groups by total request count (all time)."""
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall(
            "SELECT group_name, COUNT(*) as cnt FROM analytics "
            "WHERE group_name != '' "
            "GROUP BY group_name ORDER BY cnt DESC LIMIT ?",
            (limit,)
        )
    return [(r[0], r[1]) for r in rows]


async def get_user_counts() -> Dict[str, int]:
    """Get unique user counts for different periods."""
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")

    async with aiosqlite.connect(DB_PATH) as db:
        row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT uid) FROM analytics "
            "WHERE timestamp LIKE ? AND uid != ''",
            (f"{today}%",)
        )
        dau = row[0][0] if row else 0

        row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT uid) FROM analytics "
            "WHERE timestamp >= ? AND uid != ''",
            (week_ago,)
        )
        wau = row[0][0] if row else 0

        row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT uid) FROM analytics "
            "WHERE timestamp >= ? AND uid != ''",
            (month_ago,)
        )
        mau = row[0][0] if row else 0

        row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT uid) FROM analytics WHERE uid != ''"
        )
        total = row[0][0] if row else 0

    return {"dau": dau, "wau": wau, "mau": mau, "total": total}


async def get_hourly_activity() -> List[Dict[str, Any]]:
    """Get request counts per hour for today."""
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall(
            "SELECT SUBSTR(timestamp, 12, 2) as hour, COUNT(*) as cnt "
            "FROM analytics WHERE timestamp LIKE ? "
            "GROUP BY hour ORDER BY hour",
            (f"{today}%",)
        )
    return [{"hour": f"{r[0]}:00", "requests": r[1]} for r in rows]


async def get_platform_breakdown() -> List[Dict[str, Any]]:
    """Get platform breakdown from user-agent data (all time)."""
    async with aiosqlite.connect(DB_PATH) as db:
        rows = await db.execute_fetchall(
            "SELECT user_agent FROM analytics WHERE user_agent != ''"
        )

    platforms: Dict[str, int] = {}
    for row in rows:
        platform = _parse_platform(row[0])
        platforms[platform] = platforms.get(platform, 0) + 1

    total = sum(platforms.values()) or 1
    result = sorted(platforms.items(), key=lambda x: x[1], reverse=True)
    return [
        {"platform": p, "count": c, "percent": round(c / total * 100, 1)}
        for p, c in result
    ]


async def get_live_activity(minutes: int = 60) -> Dict[str, Any]:
    """Get activity for the last N minutes."""
    cutoff = (datetime.now() - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    async with aiosqlite.connect(DB_PATH) as db:
        row = await db.execute_fetchall(
            "SELECT COUNT(*) FROM analytics WHERE timestamp >= ?",
            (cutoff,)
        )
        requests = row[0][0] if row else 0

        row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT uid) FROM analytics "
            "WHERE timestamp >= ? AND uid != ''",
            (cutoff,)
        )
        users = row[0][0] if row else 0

        rows = await db.execute_fetchall(
            "SELECT group_name, COUNT(*) as cnt FROM analytics "
            "WHERE timestamp >= ? AND group_name != '' "
            "GROUP BY group_name ORDER BY cnt DESC LIMIT 3",
            (cutoff,)
        )
        top = [(r[0], r[1]) for r in rows]

    return {
        "period_minutes": minutes,
        "requests": requests,
        "unique_users": users,
        "top_groups": top
    }
