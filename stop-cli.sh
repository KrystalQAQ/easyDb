#!/bin/sh
set -e

docker rm -f easydb-nginx easydb-gateway >/dev/null 2>&1 || true
echo 'easydb containers stopped.'
