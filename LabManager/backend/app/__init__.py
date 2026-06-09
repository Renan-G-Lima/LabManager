# ════════════════════════════════════════════════════
#  __init__.py — App factory (with frontend serving)
# ════════════════════════════════════════════════════

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_pool, close_pool
from app.main import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_pool()
    except Exception as e:
        print(f"⚠️ Startup DB error (non-fatal): {e}")
    yield
    await close_pool()


def find_frontend_path():
    """
    Tenta encontrar a pasta frontend em vários caminhos possíveis.
    Funciona tanto localmente quanto no Render.
    """
    # Caminho do arquivo atual: backend/app/__init__.py
    current_dir = Path(__file__).resolve().parent  # backend/app/
    
    # Possíveis localizações da pasta frontend
    candidates = [
        current_dir / '..' / '..' / 'frontend',           # backend/app/../../frontend (local)
        current_dir / '..' / '..' / '..' / 'frontend',     # um nível acima (caso de subpasta)
        Path('/opt/render/project/src/LabManager/frontend'),  # Render com subpasta
        Path('/opt/render/project/src/frontend'),           # Render sem subpasta
        current_dir / '..' / 'frontend',                    # frontend ao lado de app/
    ]
    
    for path in candidates:
        resolved = path.resolve()
        index_file = resolved / 'index.html'
        if resolved.exists() and index_file.exists():
            print(f"✅ Frontend found at: {resolved}")
            return str(resolved)
    
    # Log de debug para ajudar a diagnosticar
    print("⚠️ Frontend NOT found. Searched paths:")
    for path in candidates:
        resolved = path.resolve()
        exists = resolved.exists()
        has_index = (resolved / 'index.html').exists() if exists else False
        print(f"   {'✅' if exists else '❌'} {resolved} (index.html: {has_index})")
    
    # Lista diretórios disponíveis para debug
    try:
        src_dir = Path('/opt/render/project/src')
        if src_dir.exists():
            print(f"\n📁 Contents of {src_dir}:")
            for item in sorted(src_dir.iterdir()):
                print(f"   {'📁' if item.is_dir() else '📄'} {item.name}")
            
            # Verifica um nível abaixo
            for item in sorted(src_dir.iterdir()):
                if item.is_dir():
                    print(f"\n   📁 Contents of {item.name}/:")
                    for sub in sorted(item.iterdir()):
                        print(f"      {'📁' if sub.is_dir() else '📄'} {sub.name}")
    except Exception as e:
        print(f"   Debug listing error: {e}")
    
    return None


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

    # Register API routes FIRST (before static files)
    app.include_router(router)

    # Health check
    @app.get("/", tags=["Health"])
    def health():
        return {
            "status": "ok",
            "service": "Lab Manager API",
            "version": "1.0.0",
        }

    # Mount frontend static files LAST (catch-all)
    frontend_path = find_frontend_path()
    if frontend_path:
        app.mount(
            "/app",
            StaticFiles(directory=frontend_path, html=True),
            name="frontend"
        )
        print(f"✅ Frontend mounted at /app → {frontend_path}")
    else:
        print("⚠️ Frontend directory not found — API only mode.")

    return app


app = create_app()
