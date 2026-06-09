# ════════════════════════════════════════════════════
#  crud.py — Database operations
#  Updated: EOL / Baixa Definitiva support
# ════════════════════════════════════════════════════

from datetime import date
from typing import Optional, List
import asyncpg


# ── ENRICH helper ─────────────────────────────────────────────

def _enrich(row: dict) -> dict:
    """Add computed MDA fields to a raw DB row."""
    r = dict(row)
    entry = r.get("entry_date") or date.today()
    days  = (date.today() - entry).days if isinstance(entry, date) else 0
    deadline = r.get("mda_deadline")
    days_left = (deadline - date.today()).days if isinstance(deadline, date) else 0

    r["days_since_entry"]    = days
    r["days_until_deadline"] = days_left
    r["mda_status_label"] = (
        "VENCIDO"  if days_left < 0 else
        "PRÓXIMO"  if days_left <= 4 else
        "OK"
    )
    r["mda_color"] = (
        "red"    if days_left < 0 else
        "yellow" if days_left <= 4 else
        "green"
    )
    return r


# ── MDA computed SQL (reusable fragment) ──────────────────────
_MDA_COMPUTED = """
    (CURRENT_DATE - m.entry_date)                             AS days_since_entry,
    (m.mda_deadline - CURRENT_DATE)                           AS days_until_deadline,
    CASE
        WHEN CURRENT_DATE > m.mda_deadline                    THEN 'VENCIDO'
        WHEN CURRENT_DATE >= (m.mda_deadline - INTERVAL '4 days') THEN 'PRÓXIMO'
        ELSE 'OK'
    END AS mda_status_label,
    CASE
        WHEN CURRENT_DATE > m.mda_deadline                    THEN 'red'
        WHEN CURRENT_DATE >= (m.mda_deadline - INTERVAL '4 days') THEN 'yellow'
        ELSE 'green'
    END AS mda_color
"""


# ── MACHINES ───────────────────────────────────────────────────

async def list_machines(
    conn:     asyncpg.Connection,
    location: Optional[str] = None,
    status:   Optional[str] = None,
    search:   Optional[str] = None,
    limit:    int = 100,
    offset:   int = 0,
) -> List[dict]:
    conditions, params, idx = [], [], 1

    if location:
        conditions.append(f"m.location = ${idx}")
        params.append(location); idx += 1

    if status:
        conditions.append(f"m.status = ${idx}")
        params.append(status); idx += 1

    if search:
        conditions.append(
            f"(UPPER(m.machine_id) LIKE ${idx} "
            f"OR UPPER(m.machine_tag) LIKE ${idx} "
            f"OR UPPER(m.model) LIKE ${idx} "
            f"OR UPPER(m.obs) LIKE ${idx})"
        )
        params.append(f"%{search.upper()}%"); idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = await conn.fetch(
        f"""
        SELECT m.*, {_MDA_COMPUTED}
        FROM machines m
        {where}
        ORDER BY m.entry_date DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params, limit, offset
    )
    return [dict(r) for r in rows]


async def get_machine_by_id(
    conn: asyncpg.Connection,
    machine_id: str
) -> Optional[dict]:
    row = await conn.fetchrow(
        f"""
        SELECT m.*, {_MDA_COMPUTED}
        FROM machines m
        WHERE UPPER(m.machine_id) = UPPER($1)
        """,
        machine_id
    )
    return dict(row) if row else None


async def create_machine(
    conn: asyncpg.Connection,
    data: dict
) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO machines (
            machine_id, machine_tag, model, serial_number, description,
            entry_date, depreciation_date, location, entry_reason, status, obs
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
        """,
        data["machine_id"],
        data["machine_tag"],
        data.get("model"),
        data.get("serial_number"),
        data.get("description"),
        data["entry_date"],
        data.get("depreciation_date"),
        data["location"],
        data["entry_reason"],
        data.get("status", "Ativo"),
        data.get("obs"),
    )
    return dict(row)


async def update_machine(
    conn:       asyncpg.Connection,
    machine_id: str,
    data:       dict
) -> Optional[dict]:
    # ── Hard block on locked machines ──
    locked = await conn.fetchval(
        "SELECT is_locked FROM machines WHERE UPPER(machine_id) = UPPER($1)",
        machine_id
    )
    if locked:
        raise PermissionError(
            f"Machine '{machine_id}' is in Baixa Definitiva and cannot be edited."
        )

    # ── Strip immutable fields ──
    forbidden = {
        "entry_date", "mda_deadline", "machine_id",
        "machine_tag", "is_locked", "eol_date",
        "eol_analista", "eol_notes"
    }
    safe = {k: v for k, v in data.items()
            if k not in forbidden and v is not None}

    if not safe:
        return await get_machine_by_id(conn, machine_id)

    set_clauses, params, idx = [], [], 1
    for col, val in safe.items():
        set_clauses.append(f"{col} = ${idx}")
        params.append(val); idx += 1

    params.append(machine_id.upper())
    row = await conn.fetchrow(
        f"""
        UPDATE machines
        SET {', '.join(set_clauses)}
        WHERE UPPER(machine_id) = ${idx}
        RETURNING *
        """,
        *params
    )
    return dict(row) if row else None


async def delete_machine(
    conn:       asyncpg.Connection,
    machine_id: str
) -> bool:
    # Cannot delete locked machines
    locked = await conn.fetchval(
        "SELECT is_locked FROM machines WHERE UPPER(machine_id) = UPPER($1)",
        machine_id
    )
    if locked:
        raise PermissionError(
            f"Machine '{machine_id}' is in Baixa Definitiva and cannot be deleted."
        )
    result = await conn.execute(
        "DELETE FROM machines WHERE UPPER(machine_id) = UPPER($1)",
        machine_id
    )
    return result != "DELETE 0"


# ── END OF LIFE ────────────────────────────────────────────────

async def register_end_of_life(
    conn:       asyncpg.Connection,
    machine_id: str,
    eol_date:   date,
    analista:   str,
    notes:      Optional[str] = None,
) -> dict:
    """
    Executes Baixa Definitiva atomically via stored function.
    After this call: is_locked = TRUE, status = 'Baixa'.
    IRREVERSIBLE.
    """
    # Pre-check
    current = await conn.fetchrow(
        "SELECT is_locked, status, machine_tag FROM machines "
        "WHERE UPPER(machine_id) = UPPER($1)",
        machine_id
    )
    if not current:
        raise ValueError(f"Machine '{machine_id}' not found.")
    if current["is_locked"]:
        raise ValueError(
            f"Machine '{current['machine_tag']}' is already in Baixa Definitiva."
        )

    # Call atomic stored function
    row = await conn.fetchrow(
        "SELECT * FROM register_end_of_life($1, $2, $3, $4)",
        machine_id.upper(),
        eol_date,
        analista,
        notes,
    )
    return dict(row) if row else {}


# ── MOVEMENTS ──────────────────────────────────────────────────

async def create_movement(
    conn: asyncpg.Connection,
    data: dict
) -> dict:
    """Creates movement WITHOUT touching entry_date or mda_deadline."""
    # Block movements on locked machines
    locked = await conn.fetchval(
        "SELECT is_locked FROM machines WHERE UPPER(machine_id) = UPPER($1)",
        data["machine_id"]
    )
    if locked:
        raise PermissionError(
            f"Machine '{data['machine_id']}' is in Baixa and cannot be moved."
        )

    current = await conn.fetchrow(
        "SELECT location FROM machines WHERE UPPER(machine_id) = UPPER($1)",
        data["machine_id"]
    )
    if not current:
        raise ValueError(f"Machine {data['machine_id']} not found")

    from_loc = data.get("from_location") or current["location"]

    movement = await conn.fetchrow(
        """
        INSERT INTO machine_movements
            (machine_id, movement_type, from_location, to_location, notes, moved_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
        """,
        data["machine_id"],
        data["movement_type"],
        from_loc,
        data["to_location"],
        data.get("notes"),
        data.get("moved_by"),
    )

    # Update only location
    await conn.execute(
        "UPDATE machines SET location = $1 WHERE UPPER(machine_id) = UPPER($2)",
        data["to_location"], data["machine_id"]
    )

    # Log in history
    await conn.execute(
        """
        INSERT INTO machine_history (machine_id, event_type, event_desc, note)
        VALUES ($1, 'Movimentação', $2, $3)
        """,
        data["machine_id"],
        f"{data['movement_type']}: {from_loc} → {data['to_location']}",
        data.get("notes"),
    )

    return dict(movement)


async def list_movements(
    conn:       asyncpg.Connection,
    machine_id: Optional[str] = None,
    limit:      int = 100
) -> List[dict]:
    if machine_id:
        rows = await conn.fetch(
            """
            SELECT * FROM machine_movements
            WHERE UPPER(machine_id) = UPPER($1)
            ORDER BY moved_at DESC LIMIT $2
            """,
            machine_id, limit
        )
    else:
        rows = await conn.fetch(
            "SELECT * FROM machine_movements ORDER BY moved_at DESC LIMIT $1",
            limit
        )
    return [dict(r) for r in rows]


# ── HISTORY ────────────────────────────────────────────────────

async def get_machine_history(
    conn:       asyncpg.Connection,
    machine_id: str
) -> List[dict]:
    rows = await conn.fetch(
        """
        SELECT * FROM machine_history
        WHERE UPPER(machine_id) = UPPER($1)
        ORDER BY event_date DESC, created_at DESC
        """,
        machine_id
    )
    return [dict(r) for r in rows]


async def add_history_event(
    conn: asyncpg.Connection,
    data: dict
) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO machine_history
            (machine_id, event_type, event_desc, note, event_date, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
        """,
        data["machine_id"],
        data["event_type"],
        data["event_desc"],
        data.get("note"),
        data.get("event_date") or date.today(),
        data.get("created_by"),
    )
    return dict(row)


# ── DASHBOARD ──────────────────────────────────────────────────

async def get_mda_alerts(
    conn:  asyncpg.Connection,
    limit: int = 20
) -> List[dict]:
    rows = await conn.fetch(
        "SELECT * FROM vw_mda_alerts LIMIT $1", limit
    )
    return [dict(r) for r in rows]


async def get_location_summary(
    conn: asyncpg.Connection
) -> List[dict]:
    rows = await conn.fetch(
        """
        SELECT
            location,
            COUNT(*)                                                   AS total,
            COUNT(*) FILTER (WHERE status = 'Ativo')                   AS ativos,
            COUNT(*) FILTER (WHERE status = 'MDA')                     AS em_mda,
            COUNT(*) FILTER (WHERE status = 'Em Estoque')              AS em_estoque,
            COUNT(*) FILTER (WHERE status = 'Depreciado')              AS depreciados,
            COUNT(*) FILTER (
                WHERE CURRENT_DATE > mda_deadline AND mda_active = TRUE
            )                                                          AS mda_vencidos,
            COUNT(*) FILTER (WHERE status = 'Baixa')                   AS em_baixa
        FROM machines
        GROUP BY location
        """
    )
    return [dict(r) for r in rows]


async def get_upcoming_depreciations(
    conn:  asyncpg.Connection,
    year:  Optional[int] = None,
    limit: int = 200
) -> List[dict]:
    if year:
        rows = await conn.fetch(
            "SELECT * FROM vw_upcoming_depreciations WHERE year = $1 LIMIT $2",
            year, limit
        )
    else:
        rows = await conn.fetch(
            "SELECT * FROM vw_upcoming_depreciations LIMIT $1", limit
        )
    return [dict(r) for r in rows]


async def get_stats(conn: asyncpg.Connection) -> dict:
    totals = await conn.fetchrow(
        """
        SELECT
            COUNT(*)                                                    AS total_machines,
            COUNT(*) FILTER (WHERE status = 'Ativo')                    AS total_active,
            COUNT(*) FILTER (WHERE status = 'MDA')                      AS total_mda,
            COUNT(*) FILTER (WHERE status = 'Em Estoque')               AS total_stock,
            COUNT(*) FILTER (WHERE status = 'Depreciado')               AS total_depreciated,
            COUNT(*) FILTER (WHERE status = 'Baixa')                    AS total_baixa,
            COUNT(*) FILTER (
                WHERE CURRENT_DATE > mda_deadline AND mda_active = TRUE
            )                                                           AS mda_overdue,
            COUNT(*) FILTER (
                WHERE CURRENT_DATE >= (mda_deadline - INTERVAL '4 days')
                  AND CURRENT_DATE <= mda_deadline
                  AND mda_active = TRUE
            )                                                           AS mda_warning
        FROM machines
        """
    )
    by_location = await get_location_summary(conn)
    return {**dict(totals), "by_location": by_location}


# ── SEARCH ─────────────────────────────────────────────────────

async def search_machines(
    conn:  asyncpg.Connection,
    query: str,
    limit: int = 20
) -> List[dict]:
    pattern = f"%{query.upper()}%"
    rows = await conn.fetch(
        f"""
        SELECT m.*, {_MDA_COMPUTED}
        FROM machines m
        WHERE UPPER(m.machine_id)    LIKE $1
           OR UPPER(m.machine_tag)   LIKE $1
           OR UPPER(m.model)         LIKE $1
           OR UPPER(m.serial_number) LIKE $1
           OR UPPER(m.obs)           LIKE $1
        ORDER BY
            CASE WHEN UPPER(m.machine_id)  = $2 THEN 0
                 WHEN UPPER(m.machine_tag) = $2 THEN 0
                 ELSE 1 END,
            m.entry_date DESC
        LIMIT $3
        """,
        pattern, query.upper(), limit
    )
    return [dict(r) for r in rows]