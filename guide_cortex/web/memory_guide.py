"""Plain-language memory layer guide for the WebUI."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from guide_cortex.config.loader import load_config
from guide_cortex.memory.memory_tree import MemoryTreeAdapter


def build_memory_guide(*, guide_workspace: Path | None = None) -> dict[str, Any]:
    config = load_config()
    workspace = config.workspace_path
    oh = config.memory_tree
    adapter = (
        MemoryTreeAdapter.from_config(oh, guide_workspace=guide_workspace or workspace)
        if oh.enabled
        else None
    )
    status = adapter.connection_status() if adapter else {"state": "disabled"}

    inbox = workspace / "memory" / "inbox"
    agent_memory = workspace / "memory" / "MEMORY.md"
    tree_content = status.get("expected_content_path") or str(workspace / "memory" / "tree" / "memory_tree" / "content")

    return {
        "layers": [
            {
                "id": "inbox",
                "title": "快捷笔记（inbox）",
                "what": "你在界面里「添加记忆」写的内容，或手动放的 .md 文件。",
                "when": "每次对话都会优先读取，适合待办、复盘、临时想法。",
                "path": str(inbox),
                "ui_action": "右侧面板点 ➕ 添加记忆",
            },
            {
                "id": "tree",
                "title": "文档记忆库（content）",
                "what": "成体系的 Markdown 笔记库（邮件摘要、会议纪要、项目记录等）。",
                "when": "根据你当前问题自动检索最相关的几段，不是全库灌进 prompt。",
                "path": tree_content,
                "ui_action": "把 .md 文件放进上述 content 目录（可用 Finder / 编辑器）",
            },
            {
                "id": "agent",
                "title": "Agent 长期记忆（MEMORY.md）",
                "what": "Agent 长期记忆文件，由 dream 任务从对话历史压缩生成。",
                "when": "作为「关于你」的背景信息，不替代上面的笔记库。",
                "path": str(agent_memory),
                "ui_action": "正常聊天即可；系统后台定期整理",
            },
            {
                "id": "persona",
                "title": "导师专有资料（references/）",
                "what": "每个导师 Skill 目录下的 references/，蒸馏时收集的调研稿和一手素材。",
                "when": "目前主要在蒸馏/更新时使用；后续会支持对话时按导师检索。",
                "path": "workspace/skills/<导师名>/references/",
                "ui_action": "左侧导师卡片 → 详情 → 查看知识库文件",
            },
        ],
        "status": {
            "enabled": oh.enabled,
            "state": status.get("state", "unknown"),
            "workspace": status.get("workspace", ""),
            "file_count": status.get("file_count", 0),
        },
    }
