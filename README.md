# Nuwa-Cortex (Guide Cortex)

个人 AI **导师 × 记忆 × 执行** 系统：在统一 Gateway 上切换不同思维导师（Skills），结合本地记忆与多渠道对话，完成从认知框架到任务执行的闭环。

| 项 | 说明 |
|---|---|
| 仓库名 | **Nuwa-Cortex** |
| 运行时产品名 | **Guide Cortex** |
| CLI | `guide`（Python 包名 `guide-cortex`） |
| 技术基底 | 基于 [nanobot](https://github.com/HKUDS/nanobot) 改造，保留 Agent Loop、WebUI、WebSocket、MCP 与多渠道能力 |

---

## 这是什么

Guide Cortex 不是「又一个聊天壳」，而是把三件事拼在一起：

1. **认知层（导师 Skills）**  
   每位导师对应 `workspace/skills/<persona>/SKILL.md`（女娲蒸馏产物），内含心智模型、决策启发式与表达风格。WebUI 选择导师后，消息会携带 `guide_persona`，后端将其注入系统提示词的 **Active Skills** 段。

2. **记忆层（Memory Tree + Inbox）**  
   从本地 Markdown 知识库检索片段，注入 `# Memory Tree Context`；支持 inbox 笔记、按 persona 的 `memory/personas/<id>/` 目录，以及定时采集/升级（cron）。

3. **执行层（Agent + 渠道）**  
   文件、搜索、exec、cron、生图、子 Agent 等工具；可通过 WebUI、飞书、企业微信智能机器人等通道接入。

更完整的架构说明见 [Guide-Cortex-Design.md](./Guide-Cortex-Design.md)。  
**生产环境部署**见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。

---

## 功能一览

| 模块 | 能力 |
|------|------|
| **WebUI** | 导师轨、会话、记忆侧栏、设置、蒸馏工作室（ingest/upgrade） |
| **WebSocket** | WebUI 与 Gateway 通信；可绑定 `0.0.0.0` 对外提供页面 |
| **飞书** | 应用机器人，WebSocket 长连接（无需公网回调） |
| **企业微信** | API 模式智能机器人，`botId` + `secret`，需 `wecom-aibot-sdk` |
| **导师** | Naval、芒格、乔布斯、张一鸣等（见 `workspace_template/skills/`） |
| **记忆** | Memory Tree 检索、inbox、persona 采集与周级升级 |
| **LLM** | 默认火山引擎 Doubao（可换 OpenRouter 等 provider） |

---

## 架构简图

```text
┌─────────────┐     guide_persona      ┌──────────────────┐
│  WebUI      │ ─────────────────────► │ WebSocket Channel │
│ (React)     │     WebSocket + HTTP   │ + 内置静态资源     │
└─────────────┘                        └────────┬─────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │   Agent Loop     │
                                     │ ContextBuilder   │
                                     │  - Active Skills │
                                     │  - Memory Tree   │
                                     │  - Persona notes │
                                     └────────┬─────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              ▼                               ▼                               ▼
      workspace/skills/              memory/tree + inbox              Feishu / WeCom
      <persona>/SKILL.md             personas/<id>/                     等渠道
```

**导师生效链路（排查「选了导师没效果」时对照）：**

1. 前端 `sendMessage(..., { cortexPersona })` → 帧内 `guide_persona`
2. `websocket.py` 写入 `metadata.guide_persona`
3. `agent/loop.py` → `_skill_names_for_message()` → `['naval']` 等
4. `agent/context.py` → 加载对应 `SKILL.md` 到 `# Active Skills`

日志关键字：`WebSocket inbound chat=... persona=...`、`Turn persona metadata=... resolved skills=...`

---

## 快速开始（本地）

### 环境要求

- Python **3.11+**
- Node.js **18+**（仅 WebUI 开发/构建时需要）

### 1. 克隆与安装

```bash
git clone git@github.com:wind-chaser-github/Nuwa-Cortex.git
cd Nuwa-Cortex

python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# 企业微信通道（可选）
pip install wecom-aibot-sdk
```

### 2. 环境变量

```bash
cp .env.example .env
# 编辑 .env，至少配置 ARK_API_KEY（火山 Doubao）
```

Gateway 启动时会按顺序尝试加载：

- `~/.guide_cortex/.env`
- 项目根目录 `.env`
- （可选）本机其它 env 文件

也可参考 `config.example.json` 合并进 `~/.guide_cortex/config.json`。

### 3. 初始化 Workspace

```bash
guide onboard -w ./workspace_template
```

- 全局配置：`~/.guide_cortex/config.json`（**勿将密钥提交 Git**）
- 导师 Skills 默认在：`<workspace>/skills/<persona>/SKILL.md`

### 4. 构建 WebUI（首次或改过前端后）

```bash
cd webui && npm install && npm run build
```

构建产物输出到 `guide_cortex/web/dist/`，由 Gateway 内置托管。

### 5. 启动 Gateway

```bash
./scripts/start-gateway.sh
# 或：guide gateway --port 18790
```

| 端点 | 默认地址 |
|------|----------|
| 健康检查 | http://127.0.0.1:18790/health |
| WebUI | http://127.0.0.1:8765/ |
| WebSocket | ws://127.0.0.1:8765/ |

### 6. WebUI 开发模式（可选）

```bash
cd webui && npm run dev
# http://127.0.0.1:5173 — 需 Gateway 已启动
```

---

## 配置要点

配置文件：`~/.guide_cortex/config.json`（camelCase 字段名）。

### 渠道

| 通道 | 关键字段 | 说明 |
|------|----------|------|
| `channels.websocket` | `host`, `port`, `websocketRequiresToken` | WebUI；公网部署见部署文档 |
| `channels.feishu` | `appId`, `appSecret`, `allowFrom` | 飞书长连接 |
| `channels.wecom` | `botId`, `secret`, `allowFrom` | 企微 API 智能机器人（非托管 DeepSeek 机器人） |

`allowFrom` 不能为空；开放访问可设 `["*"]`。

### Agent / Workspace

```json
{
  "agents": {
    "defaults": {
      "workspace": "/path/to/workspace_template",
      "provider": "volcengine",
      "model": "doubao-seed-2-0-pro-260215",
      "botName": "Guide Cortex"
    }
  }
}
```

### Memory Tree

```json
{
  "memory_tree": {
    "enabled": true,
    "repo": "/path/to/memory_tree"
  }
}
```

内容目录示例：`workspace/memory/tree/` 或独立 Memory Tree 仓库。

### 公网 WebUI（免登录提示）

若 `channels.websocket.host` 为 `0.0.0.0` 且不需要 bootstrap 密码：

```json
{
  "channels": {
    "websocket": {
      "host": "0.0.0.0",
      "port": 8766,
      "websocketRequiresToken": false,
      "tokenIssueSecret": "",
      "tokenIssuePath": ""
    }
  }
}
```

需要鉴权时，应设置 `tokenIssueSecret` 并通过 bootstrap 获取 token（详见 [webui/README.md](./webui/README.md)）。

---

## 目录结构

```text
guide_cortex/           # Python 包：Agent、Gateway、Channels、Web API
webui/                  # React WebUI 源码
guide_cortex/web/dist/  # 构建后的 WebUI（发布前需 npm run build）
workspace_template/     # 示例 workspace：skills、记忆模板、cron
scripts/                # start-gateway.sh 等
docs/                   # 部署与运维文档
Guide-Cortex-Design.md  # 系统设计说明
config.example.json     # 配置片段示例
.env.example            # 环境变量示例
```

---

## 常用命令

```bash
guide onboard -w ./workspace_template   # 初始化 workspace
guide gateway --port 18790              # 启动 Gateway
guide --help                            # 查看全部子命令
```

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | 生产部署、systemd、多机隔离、同步配置、排障 |
| [Guide-Cortex-Design.md](./Guide-Cortex-Design.md) | 愿景、三层架构、工作流 |
| [webui/README.md](./webui/README.md) | WebUI 开发、远程访问与鉴权 |
| [guide_cortex/skills/README.md](./guide_cortex/skills/README.md) | 内置 skills 说明 |

---

## 致谢

- [nanobot](https://github.com/HKUDS/nanobot) — Agent 执行层与 WebUI 基础
- 女娲蒸馏 Skill 体系 — 导师 `SKILL.md` 方法论来源
