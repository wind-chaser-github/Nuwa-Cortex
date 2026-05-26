"""Persona / skill detail payloads for the WebUI."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from guide_cortex.agent.skills import SkillsLoader
from guide_cortex.config.loader import load_config
from guide_cortex.web.persona_catalog import resolve_persona_category


def _file_entry(path: Path, *, root: Path) -> dict[str, Any]:
    rel = path.relative_to(root).as_posix()
    kind = "other"
    if "/references/research/" in f"/{rel}/" or rel.startswith("references/research/"):
        kind = "research"
    elif "/references/sources/" in f"/{rel}/" or rel.startswith("references/sources/"):
        kind = "sources"
    elif rel.startswith("references/"):
        kind = "references"
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    return {
        "name": path.name,
        "path": rel,
        "kind": kind,
        "size": size,
    }


def _scan_references(skill_dir: Path) -> list[dict[str, Any]]:
    refs_root = skill_dir / "references"
    if not refs_root.is_dir():
        return []
    files: list[dict[str, Any]] = []
    for path in sorted(refs_root.rglob("*")):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        files.append(_file_entry(path, root=skill_dir))
    return files


def build_persona_detail(persona_id: str) -> dict[str, Any]:
    config = load_config()
    workspace = config.workspace_path
    loader = SkillsLoader(workspace)

    entry = None
    for row in loader.list_skills(filter_unavailable=False):
        if row["name"] == persona_id:
            entry = row
            break
    if entry is None:
        raise KeyError(f"persona not found: {persona_id}")

    from guide_cortex.web.guide_dashboard import _persona_kind

    meta = loader.get_skill_metadata(persona_id) or {}
    kind = _persona_kind(loader, persona_id, meta)
    skill_path = Path(entry["path"]) if entry.get("path") else workspace / "skills" / persona_id
    skill_file = skill_path / "SKILL.md"
    skill_text = ""
    skill_lines = 0
    if skill_file.is_file():
        try:
            skill_text = skill_file.read_text(encoding="utf-8", errors="replace")
            skill_lines = skill_text.count("\n") + 1
        except OSError:
            pass

    references = _scan_references(skill_path)
    research_count = sum(1 for f in references if f["kind"] == "research")
    sources_count = sum(1 for f in references if f["kind"] == "sources")

    return {
        "id": persona_id,
        "name": persona_id,
        "label": meta.get("name") or persona_id,
        "description": loader._get_skill_description(persona_id),
        "kind": kind,
        "category": resolve_persona_category(persona_id, meta),
        "source": entry.get("source", "workspace"),
        "skill_path": str(skill_path),
        "skill_file": str(skill_file),
        "skill_lines": skill_lines,
        "skill_preview": skill_text[:2400].strip(),
        "references": references,
        "reference_stats": {
            "total": len(references),
            "research": research_count,
            "sources": sources_count,
        },
        "persona_memory_dir": str(workspace / "memory" / "personas" / persona_id),
        "has_persona_memory_dir": (workspace / "memory" / "personas" / persona_id).is_dir(),
    }
