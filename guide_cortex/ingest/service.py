"""Orchestrate scheduled and manual ingest runs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from loguru import logger

from guide_cortex.agent.skills import SkillsLoader
from guide_cortex.ingest.collector import (
    IngestRunResult,
    ingest_inbox_for_personas,
    ingest_local_file,
    ingest_text,
    ingest_url,
)
from guide_cortex.ingest.config import IngestConfig
from guide_cortex.ingest.manifest import IngestManifest, utc_now_iso


class IngestService:
    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace.expanduser().resolve()

    def _persona_exists(self, persona_id: str) -> bool:
        loader = SkillsLoader(self.workspace)
        return any(row["name"] == persona_id for row in loader.list_skills(filter_unavailable=False))

    def status(self, persona_id: str | None = None) -> dict[str, Any]:
        manifest = IngestManifest.load(self.workspace)
        config = IngestConfig.load(self.workspace)
        if persona_id:
            state = manifest.state_for(persona_id)
            watch = config.watch_for(persona_id)
            return {
                "persona_id": persona_id,
                "last_ingest_at": state.last_ingest_at,
                "last_upgrade_at": state.last_upgrade_at,
                "pending_upgrade": state.pending_upgrade,
                "sources_written": state.sources_written,
                "last_error": state.last_error,
                "last_result": state.last_result,
                "watch_urls": watch.watch_urls if watch else [],
                "auto_upgrade": watch.auto_upgrade if watch else config.auto_upgrade,
            }

        pending = [pid for pid, st in manifest.personas.items() if st.pending_upgrade]
        return {
            "enabled": config.enabled,
            "global_last_run_at": manifest.global_last_run_at,
            "pending_upgrades": pending,
            "persona_count": len(config.personas),
        }

    async def add_content(
        self,
        *,
        title: str,
        content: str,
        persona_id: str | None = None,
        url: str | None = None,
    ) -> IngestRunResult:
        manifest = IngestManifest.load(self.workspace)
        result = IngestRunResult(persona_id=persona_id)

        if persona_id and not self._persona_exists(persona_id):
            raise KeyError(f"persona not found: {persona_id}")

        if url and url.strip():
            item = await ingest_url(self.workspace, url.strip(), persona_id=persona_id, manifest=manifest)
            result.items.append(item)
        elif content.strip():
            item = ingest_text(
                self.workspace,
                title=title,
                content=content,
                persona_id=persona_id,
                manifest=manifest,
            )
            result.items.append(item)
        else:
            raise ValueError("content or url is required")

        self._finalize_result(manifest, result, persona_id)
        return result

    async def run_persona(self, persona_id: str) -> IngestRunResult:
        if not self._persona_exists(persona_id):
            raise KeyError(f"persona not found: {persona_id}")

        manifest = IngestManifest.load(self.workspace)
        config = IngestConfig.load(self.workspace)
        watch = config.watch_for(persona_id)
        result = IngestRunResult(persona_id=persona_id)

        if watch and watch.enabled:
            for url in watch.watch_urls:
                item = await ingest_url(self.workspace, url, persona_id=persona_id, manifest=manifest)
                result.items.append(item)

        self._finalize_result(manifest, result, persona_id)
        return result

    async def run_all(self) -> dict[str, Any]:
        config = IngestConfig.load(self.workspace)
        if not config.enabled:
            return {"enabled": False, "results": []}

        manifest = IngestManifest.load(self.workspace)
        results: list[dict[str, Any]] = []

        inbox_result = ingest_inbox_for_personas(self.workspace, manifest)
        if inbox_result.items:
            results.append(inbox_result.to_dict())

        persona_ids = set(config.personas.keys())
        loader = SkillsLoader(self.workspace)
        for entry in loader.list_skills(filter_unavailable=False):
            name = entry["name"]
            if name.endswith("-perspective") or name in persona_ids:
                persona_ids.add(name)

        for persona_id in sorted(persona_ids):
            watch = config.watch_for(persona_id)
            if watch and not watch.enabled:
                continue
            if not watch or not watch.watch_urls:
                continue
            try:
                row = await self.run_persona(persona_id)
                results.append(row.to_dict())
            except KeyError:
                continue

        manifest.global_last_run_at = utc_now_iso()
        manifest.save(self.workspace)
        return {"enabled": True, "results": results, "global_last_run_at": manifest.global_last_run_at}

    def ingest_file(self, path: Path, *, persona_id: str | None = None) -> IngestRunResult:
        manifest = IngestManifest.load(self.workspace)
        if persona_id and not self._persona_exists(persona_id):
            raise KeyError(f"persona not found: {persona_id}")
        item = ingest_local_file(self.workspace, path, persona_id=persona_id, manifest=manifest)
        result = IngestRunResult(persona_id=persona_id, items=[item])
        self._finalize_result(manifest, result, persona_id)
        return result

    def _finalize_result(
        self,
        manifest: IngestManifest,
        result: IngestRunResult,
        persona_id: str | None,
    ) -> None:
        for item in result.items:
            if item.status == "written":
                result.written += 1
            elif item.status == "skipped":
                result.skipped += 1
            else:
                result.errors += 1

        if persona_id:
            state = manifest.state_for(persona_id)
            state.last_ingest_at = utc_now_iso()
            state.sources_written += result.written
            state.last_result = result.to_dict()
            state.pending_upgrade = state.pending_upgrade or result.written > 0
            state.last_error = next((i.error for i in result.items if i.error), None)
            result.pending_upgrade = state.pending_upgrade

        manifest.global_last_run_at = utc_now_iso()
        manifest.save(self.workspace)

    def personas_pending_upgrade(self) -> list[str]:
        manifest = IngestManifest.load(self.workspace)
        config = IngestConfig.load(self.workspace)
        pending: list[str] = []
        for pid, state in manifest.personas.items():
            if not state.pending_upgrade:
                continue
            watch = config.watch_for(pid)
            if watch and not watch.auto_upgrade and not config.auto_upgrade:
                continue
            pending.append(pid)
        return pending

    def mark_upgraded(self, persona_id: str) -> None:
        manifest = IngestManifest.load(self.workspace)
        state = manifest.state_for(persona_id)
        state.pending_upgrade = False
        state.last_upgrade_at = utc_now_iso()
        state.last_error = None
        manifest.save(self.workspace)

    def mark_upgrade_failed(self, persona_id: str, error: str) -> None:
        manifest = IngestManifest.load(self.workspace)
        state = manifest.state_for(persona_id)
        state.last_error = error[:500]
        manifest.save(self.workspace)
