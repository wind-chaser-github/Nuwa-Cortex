"""Persona categorization for Guide Cortex dashboard."""

from __future__ import annotations

from typing import Any

DEFAULT_PERSONA_CATEGORIES: dict[str, str] = {
    "naval": "startup",
    "munger": "investment",
    "paul-graham": "startup",
    "steve-jobs": "product",
    "elon-musk": "startup",
    "feynman": "learning",
    "taleb": "risk",
    "socrates": "philosophy",
    "andrej-karpathy": "tech",
    "ilya-sutskever": "tech",
    "mrbeast": "content",
    "zhang-yiming": "startup",
    "zhangxuefeng": "philosophy",
    "sun-yuchen": "startup",
    "trump": "strategy",
    "x-mastery": "content",
    "skill-distill": "tools",
}

CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "startup": {"zh": "创业商业", "en": "Startup & Business"},
    "investment": {"zh": "投资判断", "en": "Investment"},
    "product": {"zh": "产品设计", "en": "Product"},
    "learning": {"zh": "学习表达", "en": "Learning"},
    "risk": {"zh": "风险决策", "en": "Risk & Uncertainty"},
    "philosophy": {"zh": "哲学思辨", "en": "Philosophy"},
    "tech": {"zh": "科技 AI", "en": "Tech & AI"},
    "content": {"zh": "内容创作", "en": "Content"},
    "strategy": {"zh": "策略博弈", "en": "Strategy"},
    "tools": {"zh": "造人工具", "en": "Studio Tools"},
    "other": {"zh": "其他", "en": "Other"},
}

CATEGORY_ORDER = [
    "tools",
    "startup",
    "investment",
    "product",
    "tech",
    "learning",
    "risk",
    "philosophy",
    "content",
    "strategy",
    "other",
]


def resolve_persona_category(name: str, meta: dict[str, Any]) -> str:
    skill_meta = meta.get("metadata") or {}
    if isinstance(skill_meta, dict):
        nested = skill_meta.get("guide_cortex") or skill_meta.get("openclaw") or {}
        if isinstance(nested, dict):
            category = nested.get("category")
            if isinstance(category, str) and category.strip():
                return category.strip()
    return DEFAULT_PERSONA_CATEGORIES.get(name, "other")


def persona_categories_payload() -> list[dict[str, str]]:
    return [
        {"id": category_id, "label_zh": labels["zh"], "label_en": labels["en"]}
        for category_id in CATEGORY_ORDER
        if category_id in CATEGORY_LABELS
        for labels in [CATEGORY_LABELS[category_id]]
    ]
