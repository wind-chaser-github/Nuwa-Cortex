"""Write short notes into workspace memory inbox from the WebUI."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path


def _slugify(title: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", title.strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:60] or "note"


def write_inbox_note(workspace: Path, *, title: str, content: str) -> Path:
    title = title.strip()
    content = content.strip()
    if not title:
        raise ValueError("title is required")
    if not content:
        raise ValueError("content is required")

    inbox = workspace / "memory" / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)

    base = _slugify(title)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    path = inbox / f"{base}-{stamp}.md"
    counter = 1
    while path.exists():
        path = inbox / f"{base}-{stamp}-{counter}.md"
        counter += 1

    body = (
        f"---\n"
        f"title: {title}\n"
        f"source: guide-inbox\n"
        f"created_at: {datetime.now(UTC).isoformat()}\n"
        f"---\n\n"
        f"# {title}\n\n"
        f"{content}\n"
    )
    path.write_text(body, encoding="utf-8")
    return path
