"""Trigger incremental persona skill upgrades via skill-distill."""

from __future__ import annotations

from typing import Any

UPGRADE_PROMPT_TEMPLATE = """更新 {label} 的 skill，检索最新公开信息并增量刷新心智模型。

请严格按 skill-distill「更新已有Skill」流程执行：
1. 读取现有 SKILL.md 与 references/ 下新增素材
2. 只启动 Agent 2（最新对话）+ Agent 5（最新决策）+ Agent 6（时间线更新）
3. 对比新信息与现有内容，增量更新 SKILL.md（不重写整份）
4. 更新「最新动态」与调研时间

目标 skill 目录：skills/{persona_id}/
{notes}"""


def build_upgrade_message(*, persona_id: str, label: str, notes: str = "") -> str:
    extra = f"补充说明：{notes.strip()}" if notes.strip() else ""
    return UPGRADE_PROMPT_TEMPLATE.format(
        label=label or persona_id,
        persona_id=persona_id,
        notes=extra,
    )


def upgrade_metadata(*, distill_skill: str = "skill-distill") -> dict[str, Any]:
    return {"guide_persona": distill_skill}


async def run_persona_upgrade(
    agent: Any,
    ingest_service: Any,
    persona_id: str,
    *,
    notes: str = "",
) -> None:
    """Run skill-distill incremental update for one persona."""
    from loguru import logger

    from guide_cortex.web.persona_detail import build_persona_detail

    try:
        detail = build_persona_detail(persona_id)
    except KeyError:
        ingest_service.mark_upgrade_failed(persona_id, "persona not found")
        return

    label = str(detail.get("label") or persona_id)
    message = build_upgrade_message(persona_id=persona_id, label=label, notes=notes)

    async def _silent(*_args: Any, **_kwargs: Any) -> None:
        pass

    try:
        await agent.process_direct(
            message,
            session_key=f"upgrade:{persona_id}",
            channel="system",
            chat_id="persona-upgrade",
            metadata=upgrade_metadata(),
            on_progress=_silent,
        )
        ingest_service.mark_upgraded(persona_id)
        logger.info("Persona upgrade completed for {}", persona_id)
    except Exception as exc:
        logger.exception("Persona upgrade failed for {}", persona_id)
        ingest_service.mark_upgrade_failed(persona_id, str(exc))


async def run_pending_upgrades(agent: Any, ingest_service: Any) -> list[str]:
    """Upgrade all personas flagged pending with auto_upgrade enabled."""
    completed: list[str] = []
    for persona_id in ingest_service.personas_pending_upgrade():
        await run_persona_upgrade(agent, ingest_service, persona_id)
        completed.append(persona_id)
    return completed
