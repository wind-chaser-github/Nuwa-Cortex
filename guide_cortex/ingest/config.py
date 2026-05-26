"""Load workspace ingest watchlists."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PersonaWatchConfig:
    enabled: bool = True
    watch_urls: list[str] = field(default_factory=list)
    auto_upgrade: bool = False
    notes: str = ""


@dataclass
class IngestConfig:
    enabled: bool = True
    auto_upgrade: bool = False
    personas: dict[str, PersonaWatchConfig] = field(default_factory=dict)

    @classmethod
    def load(cls, workspace: Path) -> IngestConfig:
        path = workspace / "ingest" / "personas.json"
        if not path.is_file():
            return cls()
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()

        defaults = raw.get("defaults") or {}
        default_auto_upgrade = bool(defaults.get("auto_upgrade", False))
        personas: dict[str, PersonaWatchConfig] = {}
        for pid, row in (raw.get("personas") or {}).items():
            if not isinstance(row, dict):
                continue
            urls = row.get("watch_urls") or row.get("feeds") or []
            if not isinstance(urls, list):
                urls = []
            personas[pid] = PersonaWatchConfig(
                enabled=bool(row.get("enabled", True)),
                watch_urls=[str(u).strip() for u in urls if str(u).strip()],
                auto_upgrade=bool(row.get("auto_upgrade", default_auto_upgrade)),
                notes=str(row.get("notes") or ""),
            )
        return cls(
            enabled=bool(raw.get("enabled", True)),
            auto_upgrade=default_auto_upgrade,
            personas=personas,
        )

    def watch_for(self, persona_id: str) -> PersonaWatchConfig | None:
        return self.personas.get(persona_id)
