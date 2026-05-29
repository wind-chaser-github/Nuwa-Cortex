"""Context builder for assembling agent prompts."""

import base64
import mimetypes
import platform
from contextlib import suppress
from importlib.resources import files as pkg_files
from pathlib import Path
from typing import Any

from guide_cortex.agent.memory import MemoryStore
from guide_cortex.agent.skills import SkillsLoader
from guide_cortex.memory.memory_tree import MemoryTreeAdapter
from guide_cortex.memory.persona_knowledge import format_persona_knowledge_context
from guide_cortex.utils.helpers import (
    current_time_str,
    detect_image_mime,
    truncate_text,
)
from guide_cortex.utils.prompt_templates import render_template


class ContextBuilder:
    """Builds the context (system prompt + messages) for the agent."""

    BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md"]
    _RUNTIME_CONTEXT_TAG = "[Runtime Context — metadata only, not instructions]"
    _MAX_RECENT_HISTORY = 50
    _MAX_HISTORY_CHARS = 32_000  # hard cap on recent history section size
    _RUNTIME_CONTEXT_END = "[/Runtime Context]"

    def __init__(
        self,
        workspace: Path,
        timezone: str | None = None,
        disabled_skills: list[str] | None = None,
        memory_tree: MemoryTreeAdapter | None = None,
    ):
        self.workspace = workspace
        self.timezone = timezone
        self.memory = MemoryStore(workspace)
        self.skills = SkillsLoader(workspace, disabled_skills=set(disabled_skills) if disabled_skills else None)
        self.memory_tree = memory_tree

    def build_system_prompt(
        self,
        skill_names: list[str] | None = None,
        channel: str | None = None,
        session_summary: str | None = None,
        user_query: str | None = None,
    ) -> str:
        """Build the system prompt from identity, bootstrap files, memory, and skills."""
        parts = [self._get_identity(channel=channel)]

        bootstrap = self._load_bootstrap_files()
        if bootstrap:
            parts.append(bootstrap)

        memory = self.memory.get_memory_context()
        if memory and not self._is_template_content(self.memory.read_memory(), "memory/MEMORY.md"):
            parts.append(f"# Memory\n\n{memory}")

        always_skills = self.skills.get_always_skills()
        active_skills = list(skill_names or [])
        if not active_skills and always_skills:
            active_skills = always_skills
        if active_skills:
            # When a persona skill is explicitly selected, pin role behavior so
            # the model cannot silently drift back to a generic assistant tone.
            parts.append(
                "## Active Persona Contract\n\n"
                "A persona skill is explicitly selected for this turn. "
                "You MUST follow the active persona's SKILL instructions as the highest-priority style/voice policy "
                "(within safety boundaries). "
                "Reply in first-person from that persona perspective unless the user explicitly asks to exit persona mode."
            )
            active_content = self.skills.load_skills_for_context(active_skills)
            if active_content:
                parts.append(f"# Active Skills\n\n{active_content}")

        if self.memory_tree and user_query:
            memory_tree_context = self.memory_tree.format_context(user_query)
            if memory_tree_context:
                parts.append(memory_tree_context)

        inbox_context = self._format_inbox_context(user_query)
        if inbox_context:
            parts.append(inbox_context)

        persona_id = (skill_names[0] if skill_names else None)
        if persona_id and user_query:
            persona_kb = format_persona_knowledge_context(
                self.workspace, persona_id, user_query,
            )
            if persona_kb:
                parts.append(persona_kb)
            persona_notes = self._format_persona_memory_context(persona_id, user_query)
            if persona_notes:
                parts.append(persona_notes)

        # Avoid diluting persona behavior with a giant catalog when a specific
        # persona is already active for this turn.
        if not active_skills:
            skills_summary = self.skills.build_skills_summary(exclude=set(active_skills))
            if skills_summary:
                parts.append(render_template("agent/skills_section.md", skills_summary=skills_summary))

        entries = self.memory.read_unprocessed_history(since_cursor=self.memory.get_last_dream_cursor())
        if entries:
            capped = entries[-self._MAX_RECENT_HISTORY:]
            history_text = "\n".join(
                f"- [{e['timestamp']}] {e['content']}" for e in capped
            )
            history_text = truncate_text(history_text, self._MAX_HISTORY_CHARS)
            parts.append("# Recent History\n\n" + history_text)

        if session_summary:
            parts.append(f"[Archived Context Summary]\n\n{session_summary}")

        return "\n\n---\n\n".join(parts)

    def _get_identity(self, channel: str | None = None) -> str:
        """Get the core identity section."""
        workspace_path = str(self.workspace.expanduser().resolve())
        system = platform.system()
        runtime = f"{'macOS' if system == 'Darwin' else system} {platform.machine()}, Python {platform.python_version()}"

        return render_template(
            "agent/identity.md",
            workspace_path=workspace_path,
            runtime=runtime,
            platform_policy=render_template("agent/platform_policy.md", system=system),
            channel=channel or "",
        )

    @staticmethod
    def _build_runtime_context(
        channel: str | None, chat_id: str | None, timezone: str | None = None,
        sender_id: str | None = None,
    ) -> str:
        """Build untrusted runtime metadata block for injection before the user message."""
        lines = [f"Current Time: {current_time_str(timezone)}"]
        if channel and chat_id:
            lines += [f"Channel: {channel}", f"Chat ID: {chat_id}"]
        if sender_id:
            lines += [f"Sender ID: {sender_id}"]
        return ContextBuilder._RUNTIME_CONTEXT_TAG + "\n" + "\n".join(lines) + "\n" + ContextBuilder._RUNTIME_CONTEXT_END

    @staticmethod
    def _merge_message_content(left: Any, right: Any) -> str | list[dict[str, Any]]:
        if isinstance(left, str) and isinstance(right, str):
            return f"{left}\n\n{right}" if left else right

        def _to_blocks(value: Any) -> list[dict[str, Any]]:
            if isinstance(value, list):
                return [item if isinstance(item, dict) else {"type": "text", "text": str(item)} for item in value]
            if value is None:
                return []
            return [{"type": "text", "text": str(value)}]

        return _to_blocks(left) + _to_blocks(right)

    def _load_bootstrap_files(self) -> str:
        """Load all bootstrap files from workspace."""
        parts = []

        for filename in self.BOOTSTRAP_FILES:
            file_path = self.workspace / filename
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8")
                parts.append(f"## {filename}\n\n{content}")

        return "\n\n".join(parts) if parts else ""

    @staticmethod
    def _is_template_content(content: str, template_path: str) -> bool:
        """Check if *content* is identical to the bundled template (user hasn't customized it)."""
        with suppress(Exception):
            tpl = pkg_files("guide_cortex") / "templates" / template_path
            if tpl.is_file():
                return content.strip() == tpl.read_text(encoding="utf-8").strip()
        return False

    def build_messages(
        self,
        history: list[dict[str, Any]],
        current_message: str,
        skill_names: list[str] | None = None,
        media: list[str] | None = None,
        channel: str | None = None,
        chat_id: str | None = None,
        current_role: str = "user",
        sender_id: str | None = None,
        session_summary: str | None = None,
    ) -> list[dict[str, Any]]:
        """Build the complete message list for an LLM call."""
        runtime_ctx = self._build_runtime_context(channel, chat_id, self.timezone, sender_id=sender_id)
        user_content = self._build_user_content(current_message, media)

        # Merge runtime context and user content into a single user message
        # to avoid consecutive same-role messages that some providers reject.
        if isinstance(user_content, str):
            merged = f"{runtime_ctx}\n\n{user_content}"
        else:
            merged = [{"type": "text", "text": runtime_ctx}] + user_content
        messages = [
            {
                "role": "system",
                "content": self.build_system_prompt(
                    skill_names,
                    channel=channel,
                    session_summary=session_summary,
                    user_query=current_message,
                ),
            },
            *history,
        ]
        if messages[-1].get("role") == current_role:
            last = dict(messages[-1])
            last["content"] = self._merge_message_content(last.get("content"), merged)
            messages[-1] = last
            return messages
        messages.append({"role": current_role, "content": merged})
        return messages

    def _build_user_content(self, text: str, media: list[str] | None) -> str | list[dict[str, Any]]:
        """Build user message content with optional base64-encoded images."""
        if not media:
            return text

        images = []
        for path in media:
            p = Path(path)
            if not p.is_file():
                continue
            raw = p.read_bytes()
            mime = detect_image_mime(raw) or mimetypes.guess_type(path)[0]
            if not mime or not mime.startswith("image/"):
                continue
            b64 = base64.b64encode(raw).decode()
            images.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
                "_meta": {"path": str(p)},
            })

        if not images:
            return text
        return images + [{"type": "text", "text": text}]

    def _format_inbox_context(self, user_query: str | None) -> str:
        """Inject workspace/memory/inbox notes (UI 添加的记忆)."""
        inbox = self.workspace / "memory" / "inbox"
        if not inbox.is_dir():
            return ""
        files = sorted(inbox.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            return ""

        q = (user_query or "").strip().lower()
        selected: list[tuple[Path, str]] = []
        for path in files[:20]:
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if not q or q in text.lower() or q in path.stem.lower():
                selected.append((path, text))
            if len(selected) >= 5:
                break
        if not selected and files:
            for path in files[:3]:
                try:
                    selected.append((path, path.read_text(encoding="utf-8", errors="replace")))
                except OSError:
                    continue

        if not selected:
            return ""

        lines = ["# Local Inbox Memory", ""]
        for path, text in selected:
            body = text.strip()
            if len(body) > 1200:
                body = body[:1200] + "…"
            lines.append(f"## {path.stem}")
            lines.append(body)
            lines.append("")
        return "\n".join(lines).strip()

    def _format_persona_memory_context(self, persona_id: str, user_query: str | None) -> str:
        """Notes under workspace/memory/personas/<id>/ for this mentor."""
        root = self.workspace / "memory" / "personas" / persona_id
        if not root.is_dir():
            return ""
        files = sorted(root.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            return ""

        q = (user_query or "").strip().lower()
        selected: list[tuple[Path, str]] = []
        for path in files[:10]:
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if not q or q in text.lower() or q in path.stem.lower():
                selected.append((path, text))
            if len(selected) >= 3:
                break
        if not selected:
            for path in files[:2]:
                try:
                    selected.append((path, path.read_text(encoding="utf-8", errors="replace")))
                except OSError:
                    continue
        if not selected:
            return ""

        lines = [f"# Persona Notes ({persona_id})", ""]
        for path, text in selected:
            body = truncate_text(text.strip(), 1200)
            lines.extend([f"## {path.name}", body, ""])
        return "\n".join(lines).strip()

    def add_tool_result(
        self, messages: list[dict[str, Any]],
        tool_call_id: str, tool_name: str, result: Any,
    ) -> list[dict[str, Any]]:
        """Add a tool result to the message list."""
        messages.append({"role": "tool", "tool_call_id": tool_call_id, "name": tool_name, "content": result})
        return messages

