#!/bin/sh
set -eu

mkdir -p /run/nginx /var/log/nginx /app/logs /app/runtime/nginx/conf.d /app/runtime/project-web

# 启动 TS 网关（tsx 运行时）
/app/node_modules/.bin/tsx /app/src/server.ts &
NODE_PID=$!

# Node 异常退出时主动结束 Nginx，避免容器僵死
(
  while kill -0 "$NODE_PID" 2>/dev/null; do
    sleep 1
  done
  nginx -s quit >/dev/null 2>&1 || true
) &
MONITOR_PID=$!

# 前台运行 Nginx
nginx -g "daemon off;" &
NGINX_PID=$!

cleanup() {
  kill "$MONITOR_PID" >/dev/null 2>&1 || true
  kill "$NGINX_PID" >/dev/null 2>&1 || true
  kill "$NODE_PID" >/dev/null 2>&1 || true
  wait "$NGINX_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
}

trap cleanup INT TERM

wait "$NGINX_PID"
status=$?
cleanup
exit "$status"
