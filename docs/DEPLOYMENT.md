# Guide Cortex 部署文档

本文说明如何在单机或 Linux 服务器上部署 **Guide Cortex（Nuwa-Cortex）**，并与本机其它服务隔离。以下示例基于已验证的生产布局，可按环境改路径与端口。

---

## 部署拓扑

```text
                    ┌─────────────────────────────────────┐
                    │           Linux 服务器                 │
                    │  /opt/nuwa-cortex/                   │
                    │    app/          ← 代码 + venv       │
                    │    runtime/      ← HOME，配置与会话   │
                    │      .guide_cortex/config.json       │
                    └─────────────────────────────────────┘
         :18791/health (Gateway API)     :8766/ (WebUI + WS)
```

| 服务 | 默认端口 | 用途 |
|------|----------|------|
| Gateway HTTP | `18790`（本地）/ `18791`（生产示例） | `/health`、部分 HTTP API |
| WebSocket + WebUI | `8765`（本地）/ `8766`（生产示例） | 页面、WS 消息、导师/记忆 API |

端口冲突时：**只改配置与 systemd 启动参数**，不要停掉机器上其它业务进程。

---

## 前置条件

- Ubuntu / Debian 等常见 Linux（亦可在 macOS 本地按「快速开始」运行）
- Python 3.11+
- Git、Node.js 18+（构建 WebUI）
- 出站网络（拉取依赖、调用 LLM、飞书/企微长连接）
- 防火墙放行你实际使用的 `Gateway` 与 `WebSocket` 端口

---

## 一、本地 / 开发机部署

### 1. 安装

```bash
git clone git@github.com:wind-chaser-github/Nuwa-Cortex.git
cd Nuwa-Cortex
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
pip install wecom-aibot-sdk   # 仅企微通道需要
```

### 2. 配置

```bash
cp .env.example .env
# 填写 ARK_API_KEY 等

guide onboard -w ./workspace_template
# 按需编辑 ~/.guide_cortex/config.json
```

### 3. 构建并启动

```bash
cd webui && npm install && npm run build && cd ..
./scripts/start-gateway.sh
# 或：guide gateway --port 18790
```

验证：

- http://127.0.0.1:18790/health → 应返回健康状态
- http://127.0.0.1:8765/ → WebUI

---

## 二、Linux 生产部署（推荐目录布局）

与现有服务共存时，建议使用**独立目录 + 独立 venv + 独立 systemd 单元**，避免污染 `~/.guide_cortex` 或其它项目的 Python 环境。

### 1. 目录规划

```bash
sudo mkdir -p /opt/nuwa-cortex/{app,runtime}
sudo chown -R "$USER":"$USER" /opt/nuwa-cortex
```

| 路径 | 说明 |
|------|------|
| `/opt/nuwa-cortex/app` | 仓库代码、` .venv`、`workspace_template` |
| `/opt/nuwa-cortex/runtime` | 作为进程 `HOME`，存放 `~/.guide_cortex/` |

### 2. 同步代码

在开发机：

```bash
rsync -avz --delete \
  --exclude '.venv' --exclude 'node_modules' --exclude '.git' \
  ./ user@YOUR_SERVER:/opt/nuwa-cortex/app/
```

或在服务器上 `git clone` 到 `/opt/nuwa-cortex/app`。

### 3. 安装依赖

```bash
cd /opt/nuwa-cortex/app
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
pip install wecom-aibot-sdk   # 可选

cd webui && npm ci && npm run build && cd ..
```

### 4. 环境与配置

```bash
# 应用 env（勿提交 Git）
cp .env.example /opt/nuwa-cortex/app/.env
# 编辑 ARK_API_KEY、飞书/企微密钥等

# 运行时配置目录
export HOME=/opt/nuwa-cortex/runtime
mkdir -p "$HOME/.guide_cortex"

# 从本机同步 config（示例）
# scp ~/.guide_cortex/config.json user@server:/opt/nuwa-cortex/runtime/.guide_cortex/config.json
```

**生产 config 必改项示例：**

```json
{
  "agents": {
    "defaults": {
      "workspace": "/opt/nuwa-cortex/app/workspace_template",
      "botName": "Guide Cortex"
    }
  },
  "channels": {
    "websocket": {
      "enabled": true,
      "host": "0.0.0.0",
      "port": 8766,
      "websocketRequiresToken": false,
      "tokenIssueSecret": "",
      "tokenIssuePath": ""
    },
    "feishu": { "enabled": true, "allowFrom": ["*"] },
    "wecom": { "enabled": true, "allowFrom": ["*"] }
  },
  "memory_tree": {
    "enabled": true,
    "repo": "/opt/nuwa-cortex/app"
  }
}
```

说明：

- `workspace` 必须指向含 `skills/` 的目录，否则导师列表为空或 persona 无法加载。
- 公网 WebUI 若出现 “Authentication required”，将 `websocketRequiresToken` 设为 `false` 并清空 `tokenIssueSecret` / `tokenIssuePath`（或正确配置鉴权，见 [webui/README.md](../webui/README.md)）。

### 5. 检查端口占用

```bash
ss -lntp | grep -E '18791|8766' || true
# 若占用，在 config 与 systemd 中改用空闲端口，例如 18792、8767
```

### 6. systemd 服务

`/etc/systemd/system/nuwa-cortex.service`：

```ini
[Unit]
Description=Nuwa-Cortex Gateway Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nuwa-cortex/app
Environment=HOME=/opt/nuwa-cortex/runtime
Environment=PYTHONUNBUFFERED=1
ExecStart=/opt/nuwa-cortex/app/.venv/bin/guide gateway --port 18791
Restart=always
RestartSec=3
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nuwa-cortex.service
sudo systemctl status nuwa-cortex.service
```

### 7. 验证

```bash
curl -s http://127.0.0.1:18791/health
# 浏览器访问：http://<服务器IP>:8766/
```

日志：

```bash
journalctl -u nuwa-cortex.service -f
```

---

## 三、配置与数据同步清单

从开发机迁到服务器时，建议逐项核对：

| 项 | 本地路径 | 服务器路径 |
|----|----------|------------|
| 环境变量 | `app/.env` | `/opt/nuwa-cortex/app/.env` |
| Gateway 配置 | `~/.guide_cortex/config.json` | `/opt/nuwa-cortex/runtime/.guide_cortex/config.json` |
| Workspace | `workspace_template/` | 同上 config 中 `agents.defaults.workspace` |
| Memory Tree 仓库 | `memory_tree` 路径 | `memory_tree.repo` 指向的目录 |
| 会话/记忆 | `workspace/sessions/` 等 | 随 workspace 一并 rsync（若需保留历史） |

**rsync 示例（配置 + workspace 数据）：**

```bash
rsync -avz ~/.guide_cortex/config.json \
  user@SERVER:/opt/nuwa-cortex/runtime/.guide_cortex/config.json

rsync -avz ./workspace_template/ \
  user@SERVER:/opt/nuwa-cortex/app/workspace_template/
```

---

## 四、更新发布流程

```bash
# 1. 同步代码
rsync -avz --exclude '.venv' --exclude 'node_modules' ./ user@SERVER:/opt/nuwa-cortex/app/

# 2. 服务器上
ssh user@SERVER <<'EOF'
cd /opt/nuwa-cortex/app
source .venv/bin/activate
pip install -e .
cd webui && npm ci && npm run build
sudo systemctl restart nuwa-cortex.service
EOF

# 3. 看日志确认通道启动
journalctl -u nuwa-cortex.service -n 50 --no-pager
```

应看到类似：`WebSocket server listening on ws://0.0.0.0:8766/`、`Feishu channel enabled`、`Wecom channel enabled`。

---

## 五、渠道说明

### 飞书

- 控制台创建应用，开启机器人与**长连接**模式
- `config.json` → `channels.feishu.appId` / `appSecret`
- 需相应 API 权限（流式卡片需 `cardkit:card:write`，否则仅影响卡片 UI，不影响对话）

### 企业微信（API 智能机器人）

- 类型：**API 模式**智能机器人（`botId` + `secret`，WebSocket 长连接）
- **不是**企微后台「只能选择 DeepSeek」的托管模型机器人
- **不是**微信客服（KF）开放接口；客服场景需另接 KF API
- 安装：`pip install wecom-aibot-sdk`

### WebUI 公网访问

- `host: "0.0.0.0"` + 安全组/防火墙放行 `port`
- 无鉴权部署：`websocketRequiresToken: false` 且清空 `tokenIssueSecret`
- 有鉴权部署：配置 `tokenIssueSecret`，WebUI 首次打开输入密钥

---

## 六、排障

### WebUI 打不开或要求 Authentication required

- 检查 `channels.websocket.host` / `port`
- 公网免密：`websocketRequiresToken: false`，`tokenIssueSecret` 为空
- 确认已 `npm run build`，且 Gateway 日志中有 WebSocket listening

### 导师选了但回答仍是通用助手

1. 浏览器发消息后，服务器日志应有：  
   `WebSocket inbound chat=... persona=naval webui=True`  
   `Turn persona metadata=... resolved skills=['naval']`
2. 若无 `persona=`：前端未传 `guide_persona`，检查 WebUI 是否最新构建
3. 若有 persona 但 `Unknown persona`：检查 `workspace/skills/<id>/SKILL.md` 是否存在
4. 若 skills 正确但风格仍弱：属模型服从度问题；确认 `agent/context.py` 已包含 **Active Persona Contract**（需较新版本）

### 响应很慢

- 主要为 LLM 推理耗时；可换更快模型或降低 `maxToolIterations`
- 飞书流式卡片权限缺失会导致前端重试/卡顿，与模型无关

### 企微启动报错 `WSClient` / 回调参数

- 需 `wecom-aibot-sdk >= 1.0`，构造方式为 `WSClient(bot_id, secret)`
- 升级代码后 `systemctl restart nuwa-cortex`

### 端口冲突

```bash
ss -lntp | grep -E '1879|876'
```

修改 `guide gateway --port` 与 `channels.websocket.port`，重启服务。

### 查看实时日志

```bash
journalctl -u nuwa-cortex.service -f
# 过滤 persona
journalctl -u nuwa-cortex.service -n 300 --no-pager | grep -E 'persona|WebSocket inbound'
```

---

## 七、安全建议

- **不要**将 `.env`、`config.json` 中的密钥提交 Git
- 公网暴露 WebUI 时优先启用 `tokenIssueSecret` + HTTPS 反向代理（Nginx/Caddy）
- `allowFrom: ["*"]` 仅用于内网或可信环境
- 生产环境避免使用 root 运行；可为 `nuwa-cortex` 单独建系统用户并收紧目录权限

---

## 八、参考实例

以下为曾使用的生产参数（可按需修改）：

| 项 | 值 |
|----|-----|
| 服务器 | `115.190.164.187` |
| Gateway | `18791` |
| WebUI / WS | `8766` |
| 应用目录 | `/opt/nuwa-cortex/app` |
| 运行时 HOME | `/opt/nuwa-cortex/runtime` |
| systemd | `nuwa-cortex.service` |

访问：`http://115.190.164.187:8766/`

---

更多产品说明见 [README.md](../README.md) 与 [Guide-Cortex-Design.md](../Guide-Cortex-Design.md)。
