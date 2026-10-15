#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export PAGES_PORT="${PAGES_PORT:-4274}"
out="${PW_OUT:-$(mktemp -d)}"
mkdir -p "$out"
if [ -z "${PW_SKIP_BUILD:-}" ]; then
	ROOMX_MIRROR_RELAYS=ws://127.0.0.1:4275 ROOMX_MIRROR_STUN=none EDITION=free BASE_PATH=/roomx pnpm exec vite build >/dev/null
	cp build/index.html build/404.html
fi

node tests/pages/server.mjs &
server=$!
node tests/mirror/relay.mjs >/dev/null &
relay=$!
trap 'kill "$server" "$relay" 2>/dev/null || true' EXIT
until curl -fs "http://127.0.0.1:${PAGES_PORT}/healthz" >/dev/null; do sleep 0.5; done
until curl -fs "http://127.0.0.1:4275/healthz" >/dev/null; do sleep 0.5; done

projects=(--project=pages-webkit)
for arg in "$@"; do
	case "$arg" in --project=*) projects=() ;; esac
done

docker run --rm --network host --ipc=host \
	--user "$(id -u):$(id -g)" -e HOME=/tmp \
	-e PAGES_URL="http://127.0.0.1:${PAGES_PORT}/roomx/" -e PW_OUTPUT_DIR=/out/results -e PW_REPORT_DIR=/out/report \
	-v "$(cd .. && pwd)":/work -v "$out":/out -w /work/web \
	mcr.microsoft.com/playwright:v1.64.0-noble \
	npx playwright test -c playwright.pages.config.ts "${projects[@]}" "$@"
