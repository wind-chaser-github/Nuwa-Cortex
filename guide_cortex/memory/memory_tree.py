"""Memory Tree memory fusion — vendored read logic, no external service."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from guide_cortex.memory.memory_tree_markdown import split_frontmatter, title_from_body
from guide_cortex.memory.memory_tree_store import MemoryTreeStore, StoredChunk, chunk_title
from guide_cortex.utils.helpers import truncate_text

if TYPE_CHECKING:
    from guide_cortex.config.schema import MemoryTreeConfig

GUIDE_ROOT = Path(__file__).resolve().parents[2]


@dataclass(slots=True)
class MemoryChunk:
    path: Path
    source: str
    title: str
    summary: str
    mtime: float
    score: float


def discover_repo(configured: str | None = None) -> Path | None:
    """Optional Rust reference checkout — for developers porting logic only, not runtime memory."""
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured).expanduser())
    env_repo = os.environ.get("MEMORY_TREE_REPO", "").strip()
    if env_repo:
        candidates.append(Path(env_repo).expanduser())

    for path in candidates:
        resolved = path.expanduser().resolve()
        if (resolved / "Cargo.toml").is_file():
            return resolved
    return None


def resolve_memory_data_root() -> Path:
    """Default memory data root under Guide Cortex config."""
    return Path.home() / ".guide_cortex"


def resolve_workspace(
    configured: str | None = None,
    *,
    guide_workspace: Path | None = None,
) -> Path:
    """Resolve memory_tree workspace: env → config → ~/.guide_cortex → bundled copy."""
    env_ws = os.environ.get("MEMORY_TREE_WORKSPACE", "").strip()
    if env_ws:
        return _normalize_workspace_path(Path(env_ws).expanduser())

    if configured:
        candidate = _normalize_workspace_path(Path(configured).expanduser())
        if MemoryTreeStore(candidate).available:
            return candidate

    root = resolve_memory_data_root()
    active = _read_active_workspace(root)
    if active is not None and MemoryTreeStore(active).available:
        return active

    default_ws = root / "workspace"
    if MemoryTreeStore(default_ws).available:
        return default_ws

    if guide_workspace is not None:
        bundled = guide_workspace / "memory" / "tree"
        if MemoryTreeStore(bundled).available:
            return bundled

    if configured:
        return _normalize_workspace_path(Path(configured).expanduser())
    if guide_workspace is not None:
        return guide_workspace / "memory" / "tree"
    return default_ws


def _normalize_workspace_path(path: Path) -> Path:
    if path.name == "workspace" and path.is_dir():
        return path
    if (path / "memory_tree").is_dir() or (path / "config.toml").is_file():
        if (path / "workspace").is_dir():
            return path / "workspace"
        return path
    if path.name != "workspace" and (path / "workspace").is_dir():
        return path / "workspace"
    return path


def _read_active_workspace(root: Path) -> Path | None:
    marker = root / "active_workspace.toml"
    if not marker.is_file():
        return None
    try:
        data = tomllib.loads(marker.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError):
        return None
    raw = str(data.get("config_dir", "")).strip()
    if not raw:
        return None
    config_dir = Path(raw).expanduser()
    if not config_dir.is_absolute():
        config_dir = root / config_dir
    return config_dir / "workspace"


class MemoryTreeAdapter:
    """Read Memory Tree memory_tree directly — SQLite + markdown on disk."""

    def __init__(
        self,
        workspace: str | Path,
        *,
        repo: Path | None = None,
        max_age_days: int = 7,
        max_chunks: int = 5,
        max_chars_per_chunk: int = 1200,
    ) -> None:
        self.repo = repo
        self.workspace = Path(workspace).expanduser().resolve()
        self.store = MemoryTreeStore(self.workspace)
        self.max_age_days = max_age_days
        self.max_chunks = max_chunks
        self.max_chars_per_chunk = max_chars_per_chunk

    @classmethod
    def from_config(cls, config: MemoryTreeConfig, *, guide_workspace: Path | None = None) -> MemoryTreeAdapter:
        repo = discover_repo(config.repo)
        workspace = resolve_workspace(config.workspace, guide_workspace=guide_workspace)
        return cls(
            workspace,
            repo=repo,
            max_age_days=config.max_age_days,
            max_chunks=config.max_chunks,
            max_chars_per_chunk=config.max_chars_per_chunk,
        )

    @property
    def content_dir(self) -> Path:
        return self.store.content_dir

    @property
    def enabled(self) -> bool:
        return self.store.available

    def connection_status(self) -> dict[str, Any]:
        repo = self.repo or discover_repo(None)
        md_count = self.store.count_md_files()
        db_count = self.store.count_db_chunks()
        total = max(md_count, db_count)

        base: dict[str, Any] = {
            "repo_path": str(repo) if repo else "",
            "expected_content_path": str(self.content_dir),
            "workspace": str(self.workspace),
            "file_count": md_count,
            "db_chunk_count": db_count,
        }

        if total > 0:
            return {
                **base,
                "state": "ready",
                "message": f"Memory Tree 记忆已内嵌读取（{total} 条），无需启动外部服务。",
            }

        if repo is not None:
            return {
                **base,
                "state": "empty",
                "message": "Memory Tree 读取逻辑已内置；memory_tree 尚无数据。",
                "install_hint": (
                    f"记忆会写入 {self.workspace}/memory_tree/。\n"
                    "也可把 .md 放到 workspace/memory/memory_tree/memory_tree/content/ 做本地演示。"
                ),
            }

        return {
            **base,
            "state": "unlinked",
            "message": "未配置 Memory Tree 工作区。设置 memory_tree.workspace 或 MEMORY_TREE_WORKSPACE。",
            "install_hint": "示例：workspace/memory/memory_tree/memory_tree/content/*.md",
        }

    def list_recent(self, limit: int | None = None) -> list[MemoryChunk]:
        cap = limit or self.max_chunks
        rows = self.store.list_recent(limit=cap, max_age_days=self.max_age_days)
        return [self._to_chunk(row) for row in rows[:cap]]

    def search(self, query: str) -> list[MemoryChunk]:
        if not query.strip():
            return self.list_recent()
        rows = self.store.search(query, limit=self.max_chunks, max_age_days=self.max_age_days)
        chunks = [self._to_chunk(row) for row in rows]
        return chunks if chunks else self.list_recent()

    def format_context(self, query: str) -> str:
        chunks = self.search(query)
        if not chunks:
            return ""

        lines = [
            "# Memory Tree Context",
            "",
            "Personal memory read from embedded Memory Tree memory_tree store:",
            "",
        ]
        for chunk in chunks:
            when = datetime.fromtimestamp(chunk.mtime, UTC).strftime("%Y-%m-%d")
            lines.append(f"## {chunk.title}")
            lines.append(f"- source: {chunk.source}")
            lines.append(f"- updated: {when}")
            lines.append(f"- path: {chunk.path}")
            lines.append("")
            lines.append(chunk.summary)
            lines.append("")
        return "\n".join(lines).strip()

    def _to_chunk(self, row: StoredChunk) -> MemoryChunk:
        path = self.content_dir / row.content_path if row.content_path else Path(row.chunk_id)
        return MemoryChunk(
            path=path,
            source=row.source_kind,
            title=chunk_title(row),
            summary=truncate_text(row.preview, self.max_chars_per_chunk),
            mtime=row.timestamp_ms / 1000.0,
            score=row.score,
        )

    @staticmethod
    def _strip_frontmatter(text: str) -> str:
        _, body = split_frontmatter(text)
        return body

    @staticmethod
    def _extract_title(text: str, fallback: str) -> str:
        _, body = split_frontmatter(text)
        return title_from_body(body, fallback)
