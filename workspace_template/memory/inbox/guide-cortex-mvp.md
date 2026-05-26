# Guide Cortex 本地记忆 · 示例项目

> 这是 `workspace/memory/inbox` 的演示条目。当 Memory Tree 工作区尚未就绪时，UI 仍会展示此类本地记忆。

## 项目：Guide Cortex MVP

- **目标**：融合 Memory Tree 记忆、Guide Skill 认知、执行层对话。
- **当前阶段**：UI 大改，集成导师视角与记忆面板。
- **模型**：火山引擎 Doubao Seed 2.0 Pro。

## 近期决策

1. 主宿主选 Python（从 nanobot 拷贝改造），Memory Tree 只读适配。
2. 导师 Skill 通过 `guide_persona` 按需激活，而非全局 always。
3. WebUI 三栏：导师轨 | 对话 | 记忆突触。

## 待验证

- Gateway + WebUI 联调
- persona 切换是否影响 system prompt
- Memory Tree 路径存在时的记忆检索
