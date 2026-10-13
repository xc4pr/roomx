#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PW_PORT="${PW_PORT:-4273}"
out="${PW_OUT:-$(mktemp -d)}"
mkdir -p "$out"
[ -n "${PW_SKIP_BUILD:-}" ] || pnpm exec vite build >/dev/null

node tests/server.mjs &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
until curl -fs "http://127.0.0.1:${PW_PORT}/api/health" >/dev/null; do sleep 0.5; done

projects=(--project=ipad-landscape --project=ipad-portrait)
for arg in "$@"; do
	case "$arg" in --project=*) projects=() ;; esac
done

docker run --rm --network host --ipc=host \
	--user "$(id -u):$(id -g)" -e HOME=/tmp \
	-e PW_EXTERNAL_SERVER=1 ${PW_VISUAL:+-e PW_VISUAL} -e PW_PORT -e PW_OUTPUT_DIR=/out/results -e PW_REPORT_DIR=/out/report \
	${PW_SCREENSHOT_DIR:+-e PW_SCREENSHOT_DIR=/shots -v "$PW_SCREENSHOT_DIR":/shots} \
	-v "$(cd .. && pwd)":/work -v "$out":/out -w /work/web \
	mcr.microsoft.com/playwright:v1.64.0-noble \
	npx playwright test "${projects[@]}" "$@"
