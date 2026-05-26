"""Cortex dashboard payloads for the Guide Cortex WebUI."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from guide_cortex.agent.memory import MemoryStore
from guide_cortex.agent.skills import SkillsLoader
from guide_cortex.config.loader import load_config
from guide_cortex.memory.memory_tree import MemoryTreeAdapter
from guide_cortex.web.memory_guide import build_memory_guide
from guide_cortex.web.persona_catalog import persona_categories_payload, resolve_persona_category


def _persona_kind(loader: SkillsLoader, name: str, meta: dict[str, Any]) -> str:
    skill_meta = loader._get_skill_meta(name)
    kind = skill_meta.get("kind")
    if isinstance(kind, str):
        return kind
    payload = meta.get("metadata") or {}
    if isinstance(payload, dict):
        nested = payload.get("guide_cortex") or payload.get("openclaw") or {}
        if isinstance(nested, dict):
            nested_kind = nested.get("kind")
            if isinstance(nested_kind, str):
                return nested_kind
    tags = meta.get("tags")
    if isinstance(tags, list) and "persona" in tags:
        return "persona"
    if name.endswith("-perspective") or name in {
        "naval", "socrates", "paul-graham", "steve-jobs", "elon-musk", "munger",
        "feynman", "taleb", "andrej-karpathy", "ilya-sutskever", "mrbeast",
        "zhang-yiming", "zhangxuefeng", "sun-yuchen", "trump", "x-mastery",
    }:
        return "persona"
    if name == "skill-distill":
        return "meta"
    return "skill"


def build_guide_dashboard(*, query: str = "") -> dict[str, Any]:
    config = load_config()
    workspace = config.workspace_path
    loader = SkillsLoader(workspace)
    memory = MemoryStore(workspace)

    personas: list[dict[str, Any]] = []
    for entry in loader.list_skills(filter_unavailable=False):
        name = entry["name"]
        meta = loader.get_skill_metadata(name) or {}
        kind = _persona_kind(loader, name, meta)
        if kind not in {"persona", "meta"}:
            continue
        personas.append(
            {
                "id": name,
                "name": name,
                "label": meta.get("name") or name,
                "description": loader._get_skill_description(name),
                "kind": kind,
                "category": resolve_persona_category(name, meta),
                "source": entry.get("source", "workspace"),
                "path": entry.get("path"),
            }
        )

    oh = config.memory_tree
    adapter = (
        MemoryTreeAdapter.from_config(oh, guide_workspace=workspace)
        if oh.enabled
        else None
    )
    oh_status = adapter.connection_status() if adapter else {"state": "disabled", "message": "Memory Tree 已关闭"}
    local_inbox = workspace / "memory" / "inbox"
    local_chunks: list[dict[str, Any]] = []
    if local_inbox.is_dir():
        for path in sorted(local_inbox.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[:oh.max_chunks]:
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            local_chunks.append(
                {
                    "title": path.stem.replace("_", " "),
                    "source": "guide-inbox",
                    "path": str(path),
                    "summary": text[:400].strip(),
                    "score": 1.0,
                }
            )

    memory_tree_chunks = [
        {
            "title": c.title,
            "source": c.source,
            "path": str(c.path),
            "summary": c.summary,
            "score": c.score,
        }
        for c in (adapter.search(query or "") if adapter else [])
    ]

    return {
        "brand": "Guide Cortex",
        "tagline": "Guide Cortex — 记忆 × 认知 × 执行",
        "workspace": str(workspace),
        "personas": personas,
        "persona_categories": persona_categories_payload(),
        "memory_guide": build_memory_guide(guide_workspace=workspace),
        "memory": {
            "memory_tree": {
                "enabled": oh.enabled,
                "connected": oh_status["state"] == "ready",
                "state": oh_status["state"],
                "message": oh_status["message"],
                "install_hint": oh_status.get("install_hint", ""),
                "repo_path": oh_status.get("repo_path", ""),
                "workspace": oh_status.get("workspace", ""),
                "content_path": oh_status.get("expected_content_path", ""),
                "chunk_count": len(memory_tree_chunks),
                "file_count": oh_status.get("file_count", 0),
                "db_chunk_count": oh_status.get("db_chunk_count", 0),
            },
            "local_inbox": {
                "path": str(local_inbox),
                "chunk_count": len(local_chunks),
            },
            "chunks": memory_tree_chunks + local_chunks,
        },
        "cortex_memory": {
            "soul_preview": memory.read_soul()[:500],
            "user_preview": memory.read_user()[:500],
            "long_term_preview": memory.read_memory()[:800],
        },
        "agent": {
            "model": config.agents.defaults.model,
            "provider": config.agents.defaults.provider,
            "bot_name": config.agents.defaults.bot_name,
        },
        "image_generation": {
            "enabled": config.tools.image_generation.enabled,
            "provider": config.tools.image_generation.provider,
            "model": config.tools.image_generation.model,
            "configured": _image_gen_configured(config),
        },
    }


def _image_gen_configured(config) -> bool:
    if not config.tools.image_generation.enabled:
        return False
    provider_name = config.tools.image_generation.provider
    pc = getattr(config.providers, provider_name, None)
    if pc is None:
        return False
    key = getattr(pc, "api_key", None)
    if isinstance(key, str) and key.strip() and not key.strip().startswith("${"):
        return True
    if isinstance(key, str) and key.strip().startswith("${"):
        import os
        var = key.strip()[2:-1]
        return bool(os.environ.get(var))
    return False
