#!/usr/bin/env bash
# 启动 Guide Cortex Gateway，自动加载 env 文件中的 LLM Key。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 按优先级加载 env（后面的不会覆盖已 export 的变量）
for env_file in \
  "$HOME/.guide_cortex/.env" \
  "$ROOT/.env" \
  "/Users/chaser/code/.env.local"; do
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    echo "Loaded env: $env_file"
  fi
done

if [[ -z "${ARK_API_KEY:-}" ]]; then
  echo "警告: ARK_API_KEY 未设置。请在 env 文件中配置，或 export ARK_API_KEY=..." >&2
fi

source "$ROOT/.venv/bin/activate"
exec guide gateway "$@"
