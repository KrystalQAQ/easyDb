#!/bin/sh
set -e

BASE_DIR=/opt/easydb-platform
NETWORK=easydb-platform-net
GATEWAY_IMAGE=ghcr.io/krystalqaq/easydb/gateway:latest
NGINX_IMAGE=ghcr.io/krystalqaq/easydb/nginx:latest

cd "$BASE_DIR"

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"

docker run --rm --network "$NETWORK" --env-file "$BASE_DIR/.env" "$GATEWAY_IMAGE" npm run auth:init
docker run --rm --network "$NETWORK" --env-file "$BASE_DIR/.env" "$GATEWAY_IMAGE" npm run platform:init

docker rm -f easydb-gateway easydb-nginx >/dev/null 2>&1 || true

docker run -d \
  --name easydb-gateway \
  --restart unless-stopped \
  --network "$NETWORK" \
  --env-file "$BASE_DIR/.env" \
  -p 3031:3000 \
  -v "$BASE_DIR/logs:/app/logs" \
  -v "$BASE_DIR/runtime/nginx/conf.d:/app/runtime/nginx/conf.d" \
  -v "$BASE_DIR/runtime/project-web:/app/runtime/project-web" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  "$GATEWAY_IMAGE"

docker run -d \
  --name easydb-nginx \
  --restart unless-stopped \
  --network "$NETWORK" \
  -p 3080:80 \
  -v "$BASE_DIR/runtime/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "$BASE_DIR/frontend:/usr/share/nginx/html:ro" \
  -v "$BASE_DIR/runtime/project-web:/project-web:ro" \
  "$NGINX_IMAGE"

echo 'easydb deployed: gateway http://<host>:3031 , nginx http://<host>:3080'
