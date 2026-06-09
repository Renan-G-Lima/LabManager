# ════════════════════════════════════════════════════
#  __init__.py — App factory
# ════════════════════════════════════════════════════
import os

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import init_pool, close_pool
from app.main import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_pool()
    yield
    # Shutdown
    await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Lab Laptop Lifecycle Manager",
        description="Backend API for managing lab laptop lifecycle, MDA tracking and logistics.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    origins = [settings.FRONTEND_ORIGIN]
    if settings.FRONTEND_ORIGIN == "*":
        origins = ["*"]
    else:
        origins.extend([
            "http://localhost:3000",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "http://localhost:8080",
        ])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    @app.get("/", tags=["Health"])
    def health():
        return {
            "status":  "ok",
            "service": "Lab Manager API",
            "version": "1.0.0",
        }

    frontend_path = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend')
    if os.path.exists(frontend_path):
        app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

    return app


app = create_app()
