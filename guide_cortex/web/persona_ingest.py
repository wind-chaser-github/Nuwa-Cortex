"""HTTP payload helpers for persona ingest / upgrade APIs."""

from __future__ import annotations

from typing import Any

from guide_cortex.config.loader import load_config
from guide_cortex.ingest.service import IngestService
from guide_cortex.web.persona_detail import build_persona_detail


def ingest_status_payload(persona_id: str | None = None) -> dict[str, Any]:
    config = load_config()
    service = IngestService(config.workspace_path)
    return service.status(persona_id)


def persona_detail_with_ingest(persona_id: str) -> dict[str, Any]:
    detail = build_persona_detail(persona_id)
    detail["ingest"] = ingest_status_payload(persona_id)
    return detail
