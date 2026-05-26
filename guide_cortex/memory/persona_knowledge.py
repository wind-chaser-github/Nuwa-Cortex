"""Search persona skill references/ as a knowledge base for chat context."""

from __future__ import annotations

import re
from pathlib import Path

from guide_cortex.utils.helpers import truncate_text


def _score_text(query: str, text: str, path: Path) -> float:
    q = query.strip().lower()
    if not q:
        return 1.0
    hay = f"{path.name} {text}".lower()
    words = [w for w in re.split(r"\W+", q) if len(w) >= 2]
    if not words:
        return 1.0 if q in hay else 0.0
    hits = sum(1 for w in words if w in hay)
    return hits / len(words)


def search_persona_references(
    workspace: Path,
    persona_id: str,
    query: str,
    *,
    limit: int = 4,
    max_chars: int = 1200,
) -> list[tuple[Path, str, float]]:
    skill_dir = workspace / "skills" / persona_id
    refs = skill_dir / "references"
    if not refs.is_dir():
        # also try *-perspective suffix dirs
        for candidate in workspace.glob("skills/*"):
            if candidate.is_dir() and candidate.name.replace("-perspective", "") == persona_id.replace("-perspective", ""):
                refs = candidate / "references"
                skill_dir = candidate
                break
    if not refs.is_dir():
        matches = list(workspace.glob(f"skills/{persona_id}*/references"))
        if matches:
            refs = matches[0]
            skill_dir = refs.parent

    if not refs.is_dir():
        return []

    ranked: list[tuple[Path, str, float]] = []
    for path in refs.rglob("*.md"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        score = _score_text(query, text, path)
        if score <= 0 and query.strip():
            continue
        ranked.append((path, text, score))

    if not ranked and query.strip():
        # fallback: most recent research files
        for path in sorted(refs.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]:
            try:
                ranked.append((path, path.read_text(encoding="utf-8", errors="replace"), 0.1))
            except OSError:
                continue

    ranked.sort(key=lambda row: row[2], reverse=True)
    return ranked[:limit]


def format_persona_knowledge_context(
    workspace: Path,
    persona_id: str,
    query: str,
    *,
    limit: int = 4,
    max_chars: int = 1200,
) -> str:
    if not persona_id or persona_id == "skill-distill":
        return ""

    hits = search_persona_references(workspace, persona_id, query, limit=limit, max_chars=max_chars)
    if not hits:
        return ""

    lines = [
        f"# Persona Knowledge Base ({persona_id})",
        "",
        "Distilled reference material for this mentor (from skills/references/):",
        "",
    ]
    for path, text, score in hits:
        rel = path.relative_to(workspace / "skills").as_posix()
        body = truncate_text(text.strip(), max_chars)
        lines.append(f"## {rel}")
        if query.strip():
            lines.append(f"- relevance: {score:.2f}")
        lines.append("")
        lines.append(body)
        lines.append("")

    return "\n".join(lines).strip()
