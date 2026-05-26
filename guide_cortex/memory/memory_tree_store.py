"""Read-only Memory Tree memory_tree store (SQLite + on-disk markdown).

Ported from:
- memory_tree/src/memory_tree/memory/tree/store.rs
- memory_tree/src/memory_tree/memory/tree/read_rpc.rs (list/search)
- memory_tree/src/memory_tree/memory/tree/content_store/read.rs (hydrate)
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from guide_cortex.memory.memory_tree_markdown import parse_memory_markdown, title_from_body


@dataclass(slots=True)
class StoredChunk:
    chunk_id: str
    source_kind: str
    source_id: str
    owner: str
    timestamp_ms: int
    preview: str
    content_path: str | None
    score: float = 1.0


class MemoryTreeStore:
    """Direct read of Memory Tree memory_tree without running core."""

    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace.expanduser().resolve()
        self.content_dir = self.workspace / "memory_tree" / "content"
        self.db_path = self.workspace / "memory_tree" / "chunks.db"
        self._retrieval = None

    @property
    def retrieval(self):
        if self._retrieval is None:
            from guide_cortex.memory.memory_tree_retrieval import MemoryTreeRetrieval

            self._retrieval = MemoryTreeRetrieval(self)
        return self._retrieval

    @property
    def has_db(self) -> bool:
        return self.db_path.is_file()

    @property
    def available(self) -> bool:
        return self.db_path.is_file() or self.content_dir.is_dir()

    def count_md_files(self) -> int:
        if not self.content_dir.is_dir():
            return 0
        return sum(1 for _ in self.content_dir.rglob("*.md"))

    def count_db_chunks(self) -> int:
        if not self.db_path.is_file():
            return 0
        try:
            with sqlite3.connect(self.db_path) as conn:
                row = conn.execute("SELECT COUNT(*) FROM mem_tree_chunks").fetchone()
                return int(row[0]) if row else 0
        except sqlite3.Error:
            return 0

    def list_recent(self, *, limit: int, max_age_days: int) -> list[StoredChunk]:
        since_ms = int((datetime.now(UTC) - timedelta(days=max_age_days)).timestamp() * 1000)

        if self.has_db:
            summaries = self.retrieval.query_summaries(None, limit=limit, since_ms=since_ms)
            if summaries:
                return [self.retrieval.summary_to_chunk(s) for s in summaries[:limit]]

        db_rows = self._list_from_db(limit=limit * 3, since_ms=since_ms)
        if db_rows:
            return self._hydrate_and_cap(db_rows, limit)

        return self._list_from_markdown(limit=limit, max_age_days=max_age_days)

    def search(self, query: str, *, limit: int, max_age_days: int) -> list[StoredChunk]:
        q = query.strip()
        if not q:
            return self.list_recent(limit=limit, max_age_days=max_age_days)

        since_ms = int((datetime.now(UTC) - timedelta(days=max_age_days)).timestamp() * 1000)

        if self.has_db:
            entities = self.retrieval.search_entities(q, limit=3)
            if entities:
                rows = self.retrieval.entity_chunks_via_index(entities[0].entity_id, limit=limit)
                hydrated = self._hydrate_and_cap(rows, limit)
                if hydrated:
                    return hydrated

            summaries = self.retrieval.query_summaries(q, limit=limit, since_ms=since_ms)
            if summaries:
                return [self.retrieval.summary_to_chunk(s) for s in summaries[:limit]]

        db_rows = self._search_db(query=q, limit=limit * 3, since_ms=since_ms)
        if db_rows:
            hydrated = self._hydrate_and_cap(db_rows, limit)
            if hydrated:
                return hydrated

        return self._search_markdown(query=q, limit=limit, max_age_days=max_age_days)

    def hydrate_body(self, chunk: StoredChunk) -> str:
        if chunk.content_path:
            path = self.content_dir / chunk.content_path
            if path.is_file():
                try:
                    parsed = parse_memory_markdown(path.read_text(encoding="utf-8", errors="replace"))
                    return parsed.body.strip()
                except OSError:
                    pass
        return chunk.preview.strip()

    def _list_from_db(self, *, limit: int, since_ms: int) -> list[StoredChunk]:
        if not self.db_path.is_file():
            return []
        sql = """
            SELECT id, source_kind, source_id, owner, timestamp_ms, content, content_path
              FROM mem_tree_chunks
             WHERE timestamp_ms >= ?
             ORDER BY timestamp_ms DESC, seq_in_source ASC
             LIMIT ?
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(sql, (since_ms, limit)).fetchall()
        except sqlite3.Error:
            return []
        return [self._row_to_chunk(row, score=1.0) for row in rows]

    def _search_db(self, *, query: str, limit: int, since_ms: int) -> list[StoredChunk]:
        if not self.db_path.is_file():
            return []
        sql = """
            SELECT id, source_kind, source_id, owner, timestamp_ms, content, content_path
              FROM mem_tree_chunks
             WHERE timestamp_ms >= ?
               AND content LIKE ?
             ORDER BY timestamp_ms DESC, seq_in_source ASC
             LIMIT ?
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(sql, (since_ms, f"%{query}%", limit)).fetchall()
        except sqlite3.Error:
            return []
        return [self._row_to_chunk(row, score=2.0) for row in rows]

    @staticmethod
    def _row_to_chunk(row: tuple, *, score: float) -> StoredChunk:
        chunk_id, source_kind, source_id, owner, timestamp_ms, content, content_path = row
        return StoredChunk(
            chunk_id=str(chunk_id),
            source_kind=str(source_kind),
            source_id=str(source_id),
            owner=str(owner),
            timestamp_ms=int(timestamp_ms),
            preview=str(content or ""),
            content_path=str(content_path) if content_path else None,
            score=score,
        )

    def _hydrate_and_cap(self, rows: list[StoredChunk], limit: int) -> list[StoredChunk]:
        out: list[StoredChunk] = []
        for row in rows:
            body = self.hydrate_body(row)
            if body:
                row.preview = body
            out.append(row)
            if len(out) >= limit:
                break
        return out

    def _list_from_markdown(self, *, limit: int, max_age_days: int) -> list[StoredChunk]:
        if not self.content_dir.is_dir():
            return []
        cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
        paths = sorted(self.content_dir.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        out: list[StoredChunk] = []
        for path in paths:
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime, UTC)
            except OSError:
                continue
            if mtime < cutoff:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            parsed = parse_memory_markdown(text)
            rel = path.relative_to(self.content_dir).as_posix()
            out.append(
                StoredChunk(
                    chunk_id=path.stem,
                    source_kind=parsed.source_kind,
                    source_id=parsed.source_id,
                    owner=scan_owner(parsed.frontmatter),
                    timestamp_ms=int(mtime.timestamp() * 1000),
                    preview=parsed.body.strip(),
                    content_path=rel,
                    score=1.0,
                )
            )
            if len(out) >= limit:
                break
        return out

    def _search_markdown(self, *, query: str, limit: int, max_age_days: int) -> list[StoredChunk]:
        if not self.content_dir.is_dir():
            return []
        q = query.lower()
        cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
        hits: list[StoredChunk] = []
        for path in self.content_dir.rglob("*.md"):
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime, UTC)
            except OSError:
                continue
            if mtime < cutoff:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            rel = path.relative_to(self.content_dir).as_posix()
            lowered = text.lower()
            path_lower = rel.lower()
            score = 0.0
            if q in path_lower:
                score += 2.0
            score += lowered.count(q) * 0.5
            if score <= 0:
                continue
            parsed = parse_memory_markdown(text)
            hits.append(
                StoredChunk(
                    chunk_id=path.stem,
                    source_kind=parsed.source_kind,
                    source_id=parsed.source_id,
                    owner=scan_owner(parsed.frontmatter),
                    timestamp_ms=int(mtime.timestamp() * 1000),
                    preview=parsed.body.strip(),
                    content_path=rel,
                    score=score,
                )
            )
        hits.sort(key=lambda c: (c.score, c.timestamp_ms), reverse=True)
        return hits[:limit]


def scan_owner(frontmatter: str) -> str:
    from guide_cortex.memory.memory_tree_markdown import scan_fm_field

    return scan_fm_field(frontmatter, "owner") or "unknown"


def chunk_title(chunk: StoredChunk) -> str:
    return title_from_body(chunk.preview, chunk.chunk_id)
