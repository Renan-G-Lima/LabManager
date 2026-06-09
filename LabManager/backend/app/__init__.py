from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_pool, close_pool
from app.main import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — tenta conectar, mas não falha se não conseguir
    try:
        await init_pool()
    except Exception as e:
        print(f"⚠️ Startup DB error (non-fatal): {e}")
    yield
    # Shutdown
    await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Lab Laptop Lifecycle Manager",
        description="Backend API for managing lab laptop lifecycle.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    @app.get("/", tags=["Health"])
    def health():
        return {
            "status": "ok",
            "service": "Lab Manager API",
            "version": "1.0.0",
        }

    return app


app = create_app()
