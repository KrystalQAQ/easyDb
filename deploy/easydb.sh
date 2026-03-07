#!/bin/sh
# EasyDB 单镜像部署脚本（容器内运行 Nginx + Node）
#
# 用法:
#   ./easydb.sh install
#   ./easydb.sh update
#   ./easydb.sh command install
#   ./easydb.sh init-db
#   ./easydb.sh uninstall
#   ./easydb.sh status

set -eu

BASE_DIR=${EASYDB_BASE_DIR:-/opt/easydb-platform}
NETWORK=${EASYDB_DOCKER_NETWORK:-easydb-platform-net}
CONTAINER_NAME=${EASYDB_CONTAINER_NAME:-easydb}
EASYDB_PORT=${EASYDB_PORT:-3080}
EASYDB_IMAGE_REPOSITORY=${EASYDB_IMAGE_REPOSITORY:-ghcr.io/krystalqaq/easydb/easydb}
EASYDB_IMAGE_TAG=${EASYDB_IMAGE_TAG:-latest}
EASYDB_IMAGE=${EASYDB_IMAGE:-${EASYDB_IMAGE_REPOSITORY}:${EASYDB_IMAGE_TAG}}

log() { echo "[easydb] $*"; }
die() { echo "[easydb] ERROR: $*" >&2; exit 1; }

quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\''/g")"
}

has_env_file() {
  [ -f "$BASE_DIR/.env" ]
}

warn_env_file() {
  if ! has_env_file; then
    log "未发现 $BASE_DIR/.env，将以纯运行时引导模式启动"
  fi
}

ensure_dirs() {
  mkdir -p "$BASE_DIR/logs"
  mkdir -p "$BASE_DIR/runtime/nginx/conf.d"
  mkdir -p "$BASE_DIR/runtime/project-web"
}

ensure_network() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"
}

pull_image() {
  log "拉取镜像..."
  docker pull "$EASYDB_IMAGE"
}

stop_container() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

init_db() {
  has_env_file || die "init-db 需要 $BASE_DIR/.env，且其中应包含可用的 DB_* 配置"
  log "初始化数据库..."
  docker run --rm \
    --network "$NETWORK" \
    --env-file "$BASE_DIR/.env" \
    "$EASYDB_IMAGE" npm run auth:init

  docker run --rm \
    --network "$NETWORK" \
    --env-file "$BASE_DIR/.env" \
    "$EASYDB_IMAGE" npm run platform:init
}

start_container() {
  log "启动 $CONTAINER_NAME..."
  if has_env_file; then
    docker run -d \
      --name "$CONTAINER_NAME" \
      --restart unless-stopped \
      --network "$NETWORK" \
      --env-file "$BASE_DIR/.env" \
      -p "$EASYDB_PORT:80" \
      -v "$BASE_DIR/logs:/app/logs" \
      -v "$BASE_DIR/runtime/nginx/conf.d:/app/runtime/nginx/conf.d" \
      -v "$BASE_DIR/runtime/project-web:/app/runtime/project-web" \
      "$EASYDB_IMAGE"
    return
  fi

  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network "$NETWORK" \
    -p "$EASYDB_PORT:80" \
    -v "$BASE_DIR/logs:/app/logs" \
    -v "$BASE_DIR/runtime/nginx/conf.d:/app/runtime/nginx/conf.d" \
    -v "$BASE_DIR/runtime/project-web:/app/runtime/project-web" \
    "$EASYDB_IMAGE"
}

print_command() {
  action=${1:-install}
  case "$action" in
    install)
      cat <<EOF
mkdir -p $(quote "$BASE_DIR")/logs $(quote "$BASE_DIR")/runtime/nginx/conf.d $(quote "$BASE_DIR")/runtime/project-web
docker network inspect $(quote "$NETWORK") >/dev/null 2>&1 || docker network create $(quote "$NETWORK")
docker pull $(quote "$EASYDB_IMAGE")
docker rm -f $(quote "$CONTAINER_NAME") >/dev/null 2>&1 || true
if [ -f $(quote "$BASE_DIR/.env") ]; then
  docker run -d --name $(quote "$CONTAINER_NAME") --restart unless-stopped --network $(quote "$NETWORK") --env-file $(quote "$BASE_DIR/.env") -p $(quote "$EASYDB_PORT:80") -v $(quote "$BASE_DIR/logs"):/app/logs -v $(quote "$BASE_DIR/runtime/nginx/conf.d"):/app/runtime/nginx/conf.d -v $(quote "$BASE_DIR/runtime/project-web"):/app/runtime/project-web $(quote "$EASYDB_IMAGE")
else
  docker run -d --name $(quote "$CONTAINER_NAME") --restart unless-stopped --network $(quote "$NETWORK") -p $(quote "$EASYDB_PORT:80") -v $(quote "$BASE_DIR/logs"):/app/logs -v $(quote "$BASE_DIR/runtime/nginx/conf.d"):/app/runtime/nginx/conf.d -v $(quote "$BASE_DIR/runtime/project-web"):/app/runtime/project-web $(quote "$EASYDB_IMAGE")
fi
EOF
      ;;
    update)
      cat <<EOF
mkdir -p $(quote "$BASE_DIR")/logs $(quote "$BASE_DIR")/runtime/nginx/conf.d $(quote "$BASE_DIR")/runtime/project-web
docker network inspect $(quote "$NETWORK") >/dev/null 2>&1 || docker network create $(quote "$NETWORK")
docker pull $(quote "$EASYDB_IMAGE")
docker rm -f $(quote "$CONTAINER_NAME") >/dev/null 2>&1 || true
if [ -f $(quote "$BASE_DIR/.env") ]; then
  docker run -d --name $(quote "$CONTAINER_NAME") --restart unless-stopped --network $(quote "$NETWORK") --env-file $(quote "$BASE_DIR/.env") -p $(quote "$EASYDB_PORT:80") -v $(quote "$BASE_DIR/logs"):/app/logs -v $(quote "$BASE_DIR/runtime/nginx/conf.d"):/app/runtime/nginx/conf.d -v $(quote "$BASE_DIR/runtime/project-web"):/app/runtime/project-web $(quote "$EASYDB_IMAGE")
else
  docker run -d --name $(quote "$CONTAINER_NAME") --restart unless-stopped --network $(quote "$NETWORK") -p $(quote "$EASYDB_PORT:80") -v $(quote "$BASE_DIR/logs"):/app/logs -v $(quote "$BASE_DIR/runtime/nginx/conf.d"):/app/runtime/nginx/conf.d -v $(quote "$BASE_DIR/runtime/project-web"):/app/runtime/project-web $(quote "$EASYDB_IMAGE")
fi
EOF
      ;;
    *)
      die "command 仅支持 install 或 update"
      ;;
  esac
}

cmd_install() {
  log "=== 首次安装 ==="
  ensure_dirs
  ensure_network
  pull_image
  warn_env_file
  start_container
  log "=== 安装完成 ==="
  log "访问地址: http://<host>:$EASYDB_PORT/"
  log "若未提供 .env，请首次访问 /setup 完成数据库引导"
}

cmd_update() {
  log "=== 更新 ==="
  ensure_dirs
  ensure_network
  pull_image
  warn_env_file
  stop_container
  start_container
  log "=== 更新完成 ==="
  log "访问地址: http://<host>:$EASYDB_PORT/"
}

cmd_command() {
  print_command "${1:-install}"
}

cmd_init_db() {
  check_env_required_for_init
  ensure_network
  pull_image
  init_db
}

check_env_required_for_init() {
  has_env_file || die "init-db 需要 $BASE_DIR/.env"
}

cmd_uninstall() {
  log "=== 卸载（保留数据目录）==="
  stop_container
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  log "容器和网络已删除，如需清理数据请手动删除 $BASE_DIR"
}

cmd_status() {
  docker ps -a --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

case "${1:-}" in
  install) cmd_install ;;
  update) cmd_update ;;
  command) shift; cmd_command "$@" ;;
  init-db) cmd_init_db ;;
  uninstall) cmd_uninstall ;;
  status) cmd_status ;;
  *) echo "用法: $0 {install|update|command [install|update]|init-db|uninstall|status}"; exit 1 ;;
esac
