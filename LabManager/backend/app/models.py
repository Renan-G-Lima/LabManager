# ════════════════════════════════════════════════════
#  models.py — Pydantic schemas
#  Updated: Added 'Baixa' status + EOL fields
# ════════════════════════════════════════════════════

import re
from datetime import date, datetime
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field, field_validator


# ── ENUMS ─────────────────────────────────────────────────────

class Location(str, Enum):
    Q1           = "Q1"
    Q2           = "Q2"
    Q3           = "Q3"
    Q4           = "Q4"
    ARM01        = "ARM01"
    ARM02        = "ARM02"
    USO_CONSUMO  = "Uso e Consumo"


class MachineStatus(str, Enum):
    ATIVO        = "Ativo"
    EM_ESTOQUE   = "Em Estoque"
    MDA          = "MDA"
    DEPRECIADO   = "Depreciado"
    DESCARTADO   = "Descartado"
    BAIXA        = "Baixa"          # End of Life — locked


class EntryReason(str, Enum):
    DESLIGAMENTO     = "Desligamento"
    REFRESH          = "Refresh"
    RETORNO_DE_ATIVO = "Retorno de Ativo"


class MovementType(str, Enum):
    ENTRADA_ESTOQUE  = "Entrada em Estoque"
    RETIRADA_ESTOQUE = "Retirada de Estoque"
    TRANSFERENCIA    = "Transferência de Local"
    RETORNO_TEMP     = "Retorno Temporário"
    DEVOLUCAO_FINAL  = "Devolução Final"


class EventType(str, Enum):
    CRIACAO      = "Criação"
    ATUALIZACAO  = "Atualização"
    MOVIMENTACAO = "Movimentação"
    ALERTA_MDA   = "Alerta MDA"
    MDA_VENCIDO  = "MDA Vencido"
    DEPRECIACAO  = "Depreciação"
    RETORNO      = "Retorno"
    DESCARTE     = "Descarte"
    NOTA         = "Nota"


# ── VALIDATOR ─────────────────────────────────────────────────

def validate_id_tag(value: str) -> str:
    """Max 8 chars, no O/o, uppercase."""
    if not value:
        raise ValueError("Cannot be empty")
    if len(value) > 8:
        raise ValueError("Must be 8 characters or fewer")
    if re.search(r'[Oo]', value):
        raise ValueError("Letter 'O' is not allowed — use zero '0'")
    return value.upper()


# ── MACHINE MODELS ─────────────────────────────────────────────

class MachineCreate(BaseModel):
    machine_id:        str
    machine_tag:       str
    model:             Optional[str] = None
    serial_number:     Optional[str] = None
    description:       Optional[str] = None
    entry_date:        date
    depreciation_date: Optional[date] = None
    location:          Location
    entry_reason:      EntryReason
    status:            MachineStatus = MachineStatus.ATIVO
    obs:               Optional[str] = None

    @field_validator("machine_id", "machine_tag")
    @classmethod
    def validate_codes(cls, v):
        return validate_id_tag(v)

    class Config:
        use_enum_values = True


class MachineUpdate(BaseModel):
    """entry_date, mda_deadline, is_locked e campos EOL são imutáveis."""
    model:             Optional[str]           = None
    serial_number:     Optional[str]           = None
    description:       Optional[str]           = None
    depreciation_date: Optional[date]          = None
    location:          Optional[Location]      = None
    status:            Optional[MachineStatus] = None
    obs:               Optional[str]           = None
    mda_active:        Optional[bool]          = None

    class Config:
        use_enum_values = True


class MachineOut(BaseModel):
    id:                int
    machine_id:        str
    machine_tag:       str
    model:             Optional[str]
    serial_number:     Optional[str]
    description:       Optional[str]
    entry_date:        date
    mda_deadline:      date
    mda_active:        bool
    depreciation_date: Optional[date]
    location:          str
    status:            str
    entry_reason:      str
    obs:               Optional[str]

    # ── EOL fields ──
    is_locked:         bool           = False
    eol_date:          Optional[date] = None
    eol_analista:      Optional[str]  = None
    eol_notes:         Optional[str]  = None

    # ── Audit ──
    created_at:        datetime
    updated_at:        datetime

    # ── Computed ──
    days_since_entry:    int
    days_until_deadline: int
    mda_status_label:    str
    mda_color:           str


# ── END OF LIFE ────────────────────────────────────────────────

class EndOfLifeCreate(BaseModel):
    machine_id: str
    eol_date:   date          = Field(default_factory=date.today)
    analista:   str           = Field(..., min_length=2,
                                      description="Nome do analista responsável")
    notes:      Optional[str] = None

    @field_validator("machine_id")
    @classmethod
    def validate_id(cls, v):
        return validate_id_tag(v)


# ── MOVEMENT MODELS ────────────────────────────────────────────

class MovementCreate(BaseModel):
    machine_id:    str
    movement_type: MovementType
    from_location: Optional[Location] = None
    to_location:   Location
    notes:         Optional[str] = None
    moved_by:      Optional[str] = None

    @field_validator("machine_id")
    @classmethod
    def validate_id(cls, v):
        return validate_id_tag(v)

    class Config:
        use_enum_values = True


class MovementOut(BaseModel):
    id:            int
    machine_id:    str
    movement_type: str
    from_location: Optional[str]
    to_location:   str
    notes:         Optional[str]
    moved_at:      datetime
    moved_by:      Optional[str]


# ── HISTORY MODELS ─────────────────────────────────────────────

class HistoryEventCreate(BaseModel):
    machine_id: str
    event_type: EventType
    event_desc: str
    note:       Optional[str] = None
    event_date: Optional[date] = None
    created_by: Optional[str] = None

    class Config:
        use_enum_values = True


class HistoryEventOut(BaseModel):
    id:         int
    machine_id: str
    event_type: str
    event_desc: str
    note:       Optional[str]
    event_date: date
    created_at: datetime
    created_by: Optional[str]


# ── DASHBOARD / VIEWS ──────────────────────────────────────────

class MDAAlertOut(BaseModel):
    machine_id:           str
    machine_tag:          str
    model:                Optional[str]
    location:             str
    status:               str
    entry_date:           date
    mda_deadline:         date
    depreciation_date:    Optional[date]
    days_since_entry:     int
    days_until_deadline:  int
    mda_status_label:     str
    mda_color:            str


class LocationSummaryOut(BaseModel):
    location:    str
    total:       int
    ativos:      int
    em_mda:      int
    em_estoque:  int
    depreciados: int
    mda_vencidos: int
    em_baixa:    int          # ← novo


class UpcomingDepreciationOut(BaseModel):
    machine_id:               str
    machine_tag:              str
    model:                    Optional[str]
    location:                 str
    depreciation_date:        date
    days_until_depreciation:  int
    year:                     int
    month:                    int
    quarter:                  str


class StatsOut(BaseModel):
    total_machines:    int
    total_active:      int
    total_mda:         int
    total_stock:       int
    total_depreciated: int
    total_baixa:       int          # ← novo
    mda_overdue:       int
    mda_warning:       int
    by_location:       List[LocationSummaryOut]