"""Persist ingest / upgrade state under workspace/ingest/."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass
class PersonaIngestState:
    last_ingest_at: str | None = None
    last_upgrade_at: str | None = None
    pending_upgrade: bool = False
    sources_written: int = 0
    last_error: str | None = None
    ingested_sources: dict[str, str] = field(default_factory=dict)
    last_result: dict[str, Any] = field(default_factory=dict)


@dataclass
class IngestManifest:
    personas: dict[str, PersonaIngestState] = field(default_factory=dict)
    global_last_run_at: str | None = None

    @classmethod
    def load(cls, workspace: Path) -> IngestManifest:
        path = workspace / "ingest" / "manifest.json"
        if not path.is_file():
            return cls()
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()
        personas: dict[str, PersonaIngestState] = {}
        for pid, row in (raw.get("personas") or {}).items():
            if not isinstance(row, dict):
                continue
            personas[pid] = PersonaIngestState(
                last_ingest_at=row.get("last_ingest_at"),
                last_upgrade_at=row.get("last_upgrade_at"),
                pending_upgrade=bool(row.get("pending_upgrade")),
                sources_written=int(row.get("sources_written") or 0),
                last_error=row.get("last_error"),
                ingested_sources=dict(row.get("ingested_sources") or {}),
                last_result=dict(row.get("last_result") or {}),
            )
        return cls(personas=personas, global_last_run_at=raw.get("global_last_run_at"))

    def save(self, workspace: Path) -> None:
        root = workspace / "ingest"
        root.mkdir(parents=True, exist_ok=True)
        payload = {
            "global_last_run_at": self.global_last_run_at,
            "personas": {
                pid: asdict(state) for pid, state in self.personas.items()
            },
        }
        path = root / "manifest.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def state_for(self, persona_id: str) -> PersonaIngestState:
        if persona_id not in self.personas:
            self.personas[persona_id] = PersonaIngestState()
        return self.personas[persona_id]


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()
