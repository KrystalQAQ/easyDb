#!/bin/sh
set -eu

CONTAINER_NAME=${EASYDB_CONTAINER_NAME:-easydb}

docker rm -f "$CONTAINER_NAME" easydb-nginx easydb-gateway >/dev/null 2>&1 || true
echo "easydb containers stopped: $CONTAINER_NAME"
