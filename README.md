# Nuwa-Cortex (Guide Cortex)

个人 AI 导师与执行系统：记忆 × 认知视角（Skills）× 多渠道执行（Gateway + WebUI）。

仓库名 **Nuwa-Cortex**，运行时产品名 **Guide Cortex**。基于 [nanobot](https://github.com/HKUDS/nanobot) 拷贝改造，复用 Agent Loop、WebUI、WebSocket、MCP 与多渠道能力；通过 Python 适配层读取本地 Memory Tree Markdown 作为对话上下文。

## 功能概览

- **WebUI**：`http://127.0.0.1:8765/`（Gateway 内置静态资源）
- **多渠道**：WebSocket、飞书（长连接）、企业微信智能机器人（API 长连接 + `wecom-aibot-sdk`）
- **导师 Skills**：切换乔布斯、张一鸣、芒格、Naval 等认知视角
- **记忆**：Memory Tree 检索、inbox、persona 采集与升级（cron）
- **工具**：文件、搜索、exec、cron、生图等

## 快速开始

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
# 编辑 .env，填入 ARK_API_KEY 等
```

Gateway 启动时会自动加载项目根目录 `.env` 及 `scripts/start-gateway.sh` 中列出的 env 文件。

### 3. 初始化

```bash
guide onboard -w ./workspace_template
```

全局配置目录：`~/.guide_cortex/config.json`（勿提交密钥到 Git）。

### 4. 启动 Gateway

```bash
./scripts/start-gateway.sh
```

健康检查：`http://127.0.0.1:18790/health`

### 5. WebUI

生产环境直接使用 Gateway 自带的 `guide_cortex/web/dist`。

开发模式：

```bash
cd webui
npm install
npm run dev
# http://127.0.0.1:5173
```

修改 WebUI 后需重新构建：

```bash
cd webui && npm run build
```

## 渠道配置示例

`~/.guide_cortex/config.json` 中 `channels` 段：

| 通道 | 说明 |
|------|------|
| `websocket` | WebUI，默认 `8765` |
| `feishu` | 飞书应用，`appId` + `appSecret`，长连接 |
| `wecom` | 企微 API 智能机器人，`botId` + `secret`，需 `wecom-aibot-sdk` |

`allowFrom` 不能为空；开放访问可设 `["*"]`。

## Memory Tree

启用后从本地 Markdown 检索记忆，注入 `# Memory Tree Context`：

```text
~/.guide_cortex/workspace/memory/tree/...
workspace_template/memory/tree/...
```

## 目录结构

```text
guide_cortex/        # Python 包（Agent、Gateway、Channels）
webui/               # React WebUI 源码
guide_cortex/web/dist/  # 构建后的 WebUI（随仓库发布）
workspace_template/  # 示例 workspace（skills、记忆模板）
scripts/             # start-gateway.sh 等
docs/                # 设计文档
```

## 致谢

- [nanobot](https://github.com/HKUDS/nanobot) — Agent 执行层与 WebUI 基础
- [Memory Tree](https://github.com/memory_tree/memory_tree) — 个人记忆与数据采集参考
