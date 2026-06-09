# ════════════════════════════════════════════════════
#  main.py — API Routes
#  Updated: EOL endpoint + lock enforcement
# ════════════════════════════════════════════════════

from datetime import date
from typing import Optional, List

import asyncpg
from fastapi import APIRouter, HTTPException, Query, Depends

from app.database import get_db
from app.models import (
    MachineCreate, MachineUpdate, MachineOut,
    MovementCreate, MovementOut,
    HistoryEventCreate, HistoryEventOut,
    MDAAlertOut, LocationSummaryOut,
    UpcomingDepreciationOut, StatsOut,
    EndOfLifeCreate,
)
from app import crud

router = APIRouter()


# ════════════════════════════════════════════════════
#  MACHINES
# ════════════════════════════════════════════════════

@router.get("/api/machines", response_model=List[MachineOut], tags=["Machines"])
async def list_all_machines(
    location: Optional[str] = Query(None),
    status:   Optional[str] = Query(None),
    search:   Optional[str] = Query(None),
    limit:    int           = Query(100, ge=1, le=500),
    offset:   int           = Query(0, ge=0),
    db: asyncpg.Connection  = Depends(get_db),
):
    return await crud.list_machines(db, location, status, search, limit, offset)


@router.get("/api/machines/{machine_id}", response_model=MachineOut, tags=["Machines"])
async def get_machine(
    machine_id: str,
    db: asyncpg.Connection = Depends(get_db),
):
    m = await crud.get_machine_by_id(db, machine_id)
    if not m:
        raise HTTPException(404, f"Machine '{machine_id}' not found.")
    return m


@router.post("/api/machines", response_model=MachineOut,
             status_code=201, tags=["Machines"])
async def create_new_machine(
    body: MachineCreate,
    db:   asyncpg.Connection = Depends(get_db),
):
    existing = await crud.get_machine_by_id(db, body.machine_id)
    if existing:
        raise HTTPException(409, f"machine_id '{body.machine_id}' already exists.")
    try:
        created = await crud.create_machine(db, body.dict())
        return await crud.get_machine_by_id(db, created["machine_id"])
    except asyncpg.UniqueViolationError as e:
        raise HTTPException(409, f"Duplicate: {e}")
    except asyncpg.CheckViolationError as e:
        raise HTTPException(400, f"Validation failed: {e}")


@router.patch("/api/machines/{machine_id}", response_model=MachineOut, tags=["Machines"])
async def patch_machine(
    machine_id: str,
    body:       MachineUpdate,
    db:         asyncpg.Connection = Depends(get_db),
):
    existing = await crud.get_machine_by_id(db, machine_id)
    if not existing:
        raise HTTPException(404, f"Machine '{machine_id}' not found.")

    # Block edits on locked machines
    if existing.get("is_locked"):
        raise HTTPException(
            403,
            f"Machine '{machine_id}' is in Baixa Definitiva "
            f"and cannot be edited."
        )

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    try:
        await crud.update_machine(db, machine_id, update_data)
        return await crud.get_machine_by_id(db, machine_id)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except asyncpg.RaiseError as e:
        raise HTTPException(400, str(e))


@router.delete("/api/machines/{machine_id}", tags=["Machines"])
async def remove_machine(
    machine_id: str,
    db:         asyncpg.Connection = Depends(get_db),
):
    try:
        deleted = await crud.delete_machine(db, machine_id)
        if not deleted:
            raise HTTPException(404, f"Machine '{machine_id}' not found.")
        return {"deleted": True, "machine_id": machine_id.upper()}
    except PermissionError as e:
        raise HTTPException(403, str(e))


# ════════════════════════════════════════════════════
#  END OF LIFE — Baixa Definitiva
# ════════════════════════════════════════════════════

@router.post(
    "/api/machines/{machine_id}/eol",
    response_model=MachineOut,
    tags=["End of Life"],
    summary="Registra Baixa Definitiva (irreversível)",
)
async def end_of_life(
    machine_id: str,
    body:       EndOfLifeCreate,
    db:         asyncpg.Connection = Depends(get_db),
):
    """
    Baixa Definitiva — marca a máquina como enviada à fábrica.

    - Define `status = 'Baixa'`
    - Define `is_locked = TRUE` (nenhuma edição posterior permitida)
    - Registra automaticamente no histórico
    - **IRREVERSÍVEL**

    Campos obrigatórios:
    - `eol_date`: Data da baixa
    - `analista`: Nome do analista responsável
    """
    try:
        await crud.register_end_of_life(
            conn       = db,
            machine_id = machine_id,
            eol_date   = body.eol_date,
            analista   = body.analista,
            notes      = body.notes,
        )
        return await crud.get_machine_by_id(db, machine_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(500, f"Unexpected error: {e}")


# ════════════════════════════════════════════════════
#  MOVEMENTS
# ════════════════════════════════════════════════════

@router.post("/api/movements", response_model=MovementOut,
             status_code=201, tags=["Movements"])
async def create_new_movement(
    body: MovementCreate,
    db:   asyncpg.Connection = Depends(get_db),
):
    try:
        return await crud.create_movement(db, body.dict())
    except ValueError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.get("/api/movements", response_model=List[MovementOut], tags=["Movements"])
async def list_all_movements(
    machine_id: Optional[str] = Query(None),
    limit:      int           = Query(100, ge=1, le=500),
    db:         asyncpg.Connection = Depends(get_db),
):
    return await crud.list_movements(db, machine_id, limit)


# ════════════════════════════════════════════════════
#  HISTORY
# ════════════════════════════════════════════════════

@router.get(
    "/api/machines/{machine_id}/history",
    response_model=List[HistoryEventOut],
    tags=["History"]
)
async def machine_history(
    machine_id: str,
    db:         asyncpg.Connection = Depends(get_db),
):
    return await crud.get_machine_history(db, machine_id)


@router.post("/api/history", response_model=HistoryEventOut,
             status_code=201, tags=["History"])
async def add_event(
    body: HistoryEventCreate,
    db:   asyncpg.Connection = Depends(get_db),
):
    return await crud.add_history_event(db, body.dict())


# ════════════════════════════════════════════════════
#  DASHBOARD
# ════════════════════════════════════════════════════

@router.get("/api/stats", response_model=StatsOut, tags=["Dashboard"])
async def dashboard_stats(db: asyncpg.Connection = Depends(get_db)):
    return await crud.get_stats(db)


@router.get("/api/alerts/mda", response_model=List[MDAAlertOut], tags=["Dashboard"])
async def mda_alerts(
    limit: int = Query(20, ge=1, le=100),
    db:    asyncpg.Connection = Depends(get_db),
):
    return await crud.get_mda_alerts(db, limit)


@router.get(
    "/api/locations/summary",
    response_model=List[LocationSummaryOut],
    tags=["Dashboard"]
)
async def location_summary(db: asyncpg.Connection = Depends(get_db)):
    return await crud.get_location_summary(db)


@router.get(
    "/api/calendar",
    response_model=List[UpcomingDepreciationOut],
    tags=["Dashboard"]
)
async def calendar_data(
    year: Optional[int]    = Query(None),
    db:   asyncpg.Connection = Depends(get_db),
):
    return await crud.get_upcoming_depreciations(db, year)


# ════════════════════════════════════════════════════
#  SEARCH
# ════════════════════════════════════════════════════

@router.get("/api/search", response_model=List[MachineOut], tags=["Search"])
async def search(
    q:     str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    db:    asyncpg.Connection = Depends(get_db),
):
    return await crud.search_machines(db, q, limit)