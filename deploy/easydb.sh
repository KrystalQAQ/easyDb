#!/bin/sh
# EasyDB 部署管理脚本
# 用法:
#   ./easydb.sh install   # 首次安装
#   ./easydb.sh update    # 更新到最新镜像
#   ./easydb.sh uninstall # 删除容器和网络（保留数据目录）
#   ./easydb.sh status    # 查看运行状态

set -e

# ─── 配置 ────────────────────────────────────────────────
BASE_DIR=/opt/easydb-platform
NETWORK=easydb-platform-net
GATEWAY_IMAGE=ghcr.io/krystalqaq/easydb/gateway:latest
NGINX_IMAGE=ghcr.io/krystalqaq/easydb/nginx:latest
GATEWAY_PORT=3031
NGINX_PORT=3080
# ─────────────────────────────────────────────────────────

log() { echo "[easydb] $*"; }
die() { echo "[easydb] ERROR: $*" >&2; exit 1; }

check_env() {
  [ -f "$BASE_DIR/.env" ] || die ".env 不存在: $BASE_DIR/.env\n请先复制 .env.example 并填写配置"
}

ensure_dirs() {
  mkdir -p "$BASE_DIR/logs"
  mkdir -p "$BASE_DIR/runtime/nginx/conf.d"
  mkdir -p "$BASE_DIR/frontend"
}

# nginx 容器挂载整个 conf.d，需要确保内置的基础配置在宿主机上存在
ensure_nginx_base_confs() {
  LOG_CONF="$BASE_DIR/runtime/nginx/conf.d/00-log-format.conf"
  DEFAULT_CONF="$BASE_DIR/runtime/nginx/conf.d/default.conf"

  if [ ! -f "$LOG_CONF" ] || [ ! -f "$DEFAULT_CONF" ]; then
    log "从镜像中提取内置 nginx 配置..."
    docker run --rm \
      -v "$BASE_DIR/runtime/nginx/conf.d:/out" \
      --entrypoint sh \
      "$NGINX_IMAGE" \
      -c "cp /etc/nginx/conf.d/00-log-format.conf /out/ && cp /etc/nginx/conf.d/default.conf /out/"
    log "nginx 基础配置已提取到 $BASE_DIR/runtime/nginx/conf.d/"
  fi
}

ensure_network() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 \
    || docker network create "$NETWORK"
}

pull_images() {
  log "拉取最新镜像..."
  docker pull "$GATEWAY_IMAGE"
  docker pull "$NGINX_IMAGE"
}

stop_containers() {
  docker rm -f easydb-gateway easydb-nginx >/dev/null 2>&1 || true
}

start_gateway() {
  log "启动 gateway..."
  docker run -d \
    --name easydb-gateway \
    --restart unless-stopped \
    --network "$NETWORK" \
    --env-file "$BASE_DIR/.env" \
    -p "$GATEWAY_PORT:3000" \
    -v "$BASE_DIR/logs:/app/logs" \
    -v "$BASE_DIR/runtime/nginx/conf.d:/app/runtime/nginx/conf.d" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    "$GATEWAY_IMAGE"
}

start_nginx() {
  log "启动 nginx..."
  docker run -d \
    --name easydb-nginx \
    --restart unless-stopped \
    --network "$NETWORK" \
    -p "$NGINX_PORT:80" \
    -v "$BASE_DIR/runtime/nginx/conf.d:/etc/nginx/conf.d:ro" \
    -v "$BASE_DIR/frontend:/usr/share/nginx/html:ro" \
    "$NGINX_IMAGE"
}

cmd_install() {
  log "=== 首次安装 ==="
  check_env
  ensure_dirs
  ensure_network
  pull_images
  ensure_nginx_base_confs

  log "初始化数据库..."
  docker run --rm \
    --network "$NETWORK" \
    --env-file "$BASE_DIR/.env" \
    "$GATEWAY_IMAGE" npm run auth:init
  docker run --rm \
    --network "$NETWORK" \
    --env-file "$BASE_DIR/.env" \
    "$GATEWAY_IMAGE" npm run platform:init

  start_gateway
  start_nginx

  log "=== 安装完成 ==="
  log "  管理后台: http://<host>:$NGINX_PORT/demo/"
  log "  Gateway API: http://<host>:$GATEWAY_PORT"
}

cmd_update() {
  log "=== 更新 ==="
  check_env
  ensure_dirs
  ensure_network
  pull_images
  # 更新时重新提取内置配置（镜像可能有变化）
  rm -f "$BASE_DIR/runtime/nginx/conf.d/00-log-format.conf"
  rm -f "$BASE_DIR/runtime/nginx/conf.d/default.conf"
  ensure_nginx_base_confs
  stop_containers
  start_gateway
  start_nginx
  log "=== 更新完成 ==="
  log "  管理后台: http://<host>:$NGINX_PORT/demo/"
}

cmd_uninstall() {
  log "=== 卸载（保留 $BASE_DIR 数据目录）==="
  stop_containers
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  log "容器和网络已删除。如需彻底清除数据请手动执行: rm -rf $BASE_DIR"
}

cmd_status() {
  echo "--- 容器状态 ---"
  docker ps -a \
    --filter "name=easydb-gateway" \
    --filter "name=easydb-nginx" \
    --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo "--- 镜像版本 ---"
  docker images \
    --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedSince}}" \
    | grep -E "REPOSITORY|easydb"
}

case "${1:-}" in
  install)   cmd_install ;;
  update)    cmd_update ;;
  uninstall) cmd_uninstall ;;
  status)    cmd_status ;;
  *) echo "用法: $0 {install|update|uninstall|status}"; exit 1 ;;
esac
