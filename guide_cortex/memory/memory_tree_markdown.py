"""Memory Tree memory-tree markdown helpers.

Ported from memory_tree/src/memory_tree/memory/tree/content_store/compose.rs
(read-only: frontmatter split + field scan).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class MemoryMarkdown:
    frontmatter: str
    body: str
    source_kind: str
    source_id: str
    timestamp: str


def split_frontmatter(text: str) -> tuple[str, str]:
    """Return (frontmatter, body). Empty frontmatter if none."""
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    fm = text[3:end].strip()
    body = text[end + 4 :].lstrip("\n")
    return fm, body


def scan_fm_field(frontmatter: str, key: str) -> str | None:
    prefix = f"{key}: "
    for raw in frontmatter.splitlines():
        if raw.startswith((" ", "\t")):
            continue
        if raw.startswith(prefix):
            rest = raw[len(prefix) :].strip()
            if rest.startswith('"') and rest.endswith('"'):
                return rest[1:-1].replace('\\"', '"').replace("\\\\", "\\")
            return rest
    return None


def parse_memory_markdown(text: str) -> MemoryMarkdown:
    fm, body = split_frontmatter(text)
    return MemoryMarkdown(
        frontmatter=fm,
        body=body,
        source_kind=scan_fm_field(fm, "source_kind") or "unknown",
        source_id=scan_fm_field(fm, "source_id") or "unknown",
        timestamp=scan_fm_field(fm, "timestamp") or "",
    )


def title_from_body(body: str, fallback: str) -> str:
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("#").strip()
    snippet = body.replace("\n", " ").strip()
    return snippet[:80] if snippet else fallback.replace("_", " ")
