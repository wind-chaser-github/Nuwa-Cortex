"""Memory Tree memory_tree retrieval — ported from memory_tree/memory/tree/retrieval/*.rs."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

from guide_cortex.memory.memory_tree_store import MemoryTreeStore, StoredChunk


@dataclass(slots=True)
class EntityMatch:
    entity_id: str
    entity_kind: str
    surface: str
    mention_count: int
    last_seen_ms: int


@dataclass(slots=True)
class SummaryHit:
    node_id: str
    tree_kind: str
    tree_scope: str
    content: str
    score: float
    time_range_end_ms: int
    child_ids: list[str]


class MemoryTreeRetrieval:
    """Read-only retrieval over chunks.db — no external Memory Tree service."""

    MAX_BATCH = 20

    def __init__(self, store: MemoryTreeStore) -> None:
        self.store = store
        self.db_path = store.db_path
        self.content_dir = store.content_dir

    @property
    def available(self) -> bool:
        return self.db_path.is_file()

    def search_entities(self, query: str, *, limit: int = 5) -> list[EntityMatch]:
        q = query.strip().lower()
        if not q or not self.available:
            return []
        sql = """
            SELECT entity_id, entity_kind, MAX(surface) AS surface_sample,
                   COUNT(*) AS mention_count, MAX(timestamp_ms) AS last_seen_ms
              FROM mem_tree_entity_index
             WHERE (LOWER(entity_id) LIKE ? OR LOWER(surface) LIKE ?)
             GROUP BY entity_id, entity_kind
             ORDER BY mention_count DESC, last_seen_ms DESC
             LIMIT ?
        """
        pattern = f"%{q}%"
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(sql, (pattern, pattern, limit)).fetchall()
        except sqlite3.Error:
            return []
        return [
            EntityMatch(
                entity_id=str(r[0]),
                entity_kind=str(r[1]),
                surface=str(r[2] or r[0]),
                mention_count=int(r[3]),
                last_seen_ms=int(r[4] or 0),
            )
            for r in rows
        ]

    def query_summaries(
        self,
        query: str | None,
        *,
        limit: int = 10,
        since_ms: int | None = None,
        tree_kind: str | None = None,
    ) -> list[SummaryHit]:
        if not self.available:
            return []
        clauses = ["deleted = 0"]
        params: list[object] = []
        if since_ms is not None:
            clauses.append("time_range_end_ms >= ?")
            params.append(since_ms)
        if tree_kind:
            clauses.append("tree_kind = ?")
            params.append(tree_kind)
        if query and query.strip():
            clauses.append("content LIKE ?")
            params.append(f"%{query.strip()}%")
        sql = f"""
            SELECT id, tree_kind, tree_id, content, score, time_range_end_ms, child_ids_json
              FROM mem_tree_summaries
             WHERE {' AND '.join(clauses)}
             ORDER BY time_range_end_ms DESC, score DESC
             LIMIT ?
        """
        params.append(limit)
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(sql, params).fetchall()
        except sqlite3.Error:
            return []
        hits: list[SummaryHit] = []
        for row in rows:
            child_raw = row[6] or "[]"
            try:
                child_ids = json.loads(child_raw)
                if not isinstance(child_ids, list):
                    child_ids = []
            except json.JSONDecodeError:
                child_ids = []
            hits.append(
                SummaryHit(
                    node_id=str(row[0]),
                    tree_kind=str(row[1]),
                    tree_scope=str(row[2]),
                    content=str(row[3] or ""),
                    score=float(row[4] or 0),
                    time_range_end_ms=int(row[5] or 0),
                    child_ids=[str(x) for x in child_ids],
                )
            )
        return hits

    def fetch_leaves(self, chunk_ids: list[str]) -> list[StoredChunk]:
        if not self.available or not chunk_ids:
            return []
        ids = chunk_ids[: self.MAX_BATCH]
        placeholders = ",".join("?" for _ in ids)
        sql = f"""
            SELECT id, source_kind, source_id, owner, timestamp_ms, content, content_path
              FROM mem_tree_chunks
             WHERE id IN ({placeholders})
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(sql, ids).fetchall()
        except sqlite3.Error:
            return []
        by_id = {str(r[0]): r for r in rows}
        out: list[StoredChunk] = []
        for cid in ids:
            row = by_id.get(cid)
            if not row:
                continue
            chunk = self.store._row_to_chunk(row, score=1.0)  # noqa: SLF001
            body = self.store.hydrate_body(chunk)
            if body:
                chunk.preview = body
            out.append(chunk)
        return out

    def summary_to_chunk(self, hit: SummaryHit) -> StoredChunk:
        return StoredChunk(
            chunk_id=hit.node_id,
            source_kind=hit.tree_kind,
            source_id=hit.tree_scope,
            owner="summary",
            timestamp_ms=hit.time_range_end_ms,
            preview=hit.content,
            content_path=None,
            score=hit.score,
        )

    def entity_chunks_via_index(self, entity_id: str, *, limit: int = 5) -> list[StoredChunk]:
        if not self.available:
            return []
        sql = """
            SELECT c.id, c.source_kind, c.source_id, c.owner, c.timestamp_ms, c.content, c.content_path
              FROM mem_tree_entity_index ei
              JOIN mem_tree_chunks c ON c.id = ei.node_id
             WHERE ei.entity_id = ?
             ORDER BY ei.timestamp_ms DESC
             LIMIT ?
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                rows = conn.execute(sql, (entity_id, limit)).fetchall()
        except sqlite3.Error:
            return []
        return [self.store._row_to_chunk(r, score=2.0) for r in rows]  # noqa: SLF001
