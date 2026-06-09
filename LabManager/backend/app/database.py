# backend/app/database.py
import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        try:
            _pool = await asyncpg.create_pool(
                dsn=settings.DATABASE_URL,
                min_size=1,
                max_size=5,
                command_timeout=30,
            )
            print("✅ Supabase connection pool initialized (direct).")
        except Exception as e:
            print(f"⚠️ DB connection failed: {e}")
            print("⚠️ Running without database — using mock data only.")
            _pool = None
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        print("🔒 DB connection pool closed.")


async def get_db():
    if _pool is None:
        await init_pool()
    if _pool is None:
        raise Exception("Database not available")
    async with _pool.acquire() as conn:
        yield conn
