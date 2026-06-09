# backend/app/database.py
"""
import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=settings.DB_MIN_SIZE,
            max_size=settings.DB_MAX_SIZE,
            command_timeout=settings.DB_TIMEOUT,
            statement_cache_size=0,           # ← obrigatório para pgbouncer
            server_settings={
                'application_name': 'lab_manager',
            },
        )
        print("✅ Supabase connection pool initialized.")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        print("🔒 Supabase connection pool closed.")


async def get_db():
    if _pool is None:
        await init_pool()
    async with _pool.acquire() as conn:
        yield conn
"""
