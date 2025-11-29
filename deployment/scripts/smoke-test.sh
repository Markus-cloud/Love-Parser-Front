#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: smoke-test.sh --base-url <url> [--health-path /health] [--smoke-path /api/v1/health]
Optional:
  --retries <n>           Number of attempts per endpoint (default: 5)
  --delay <seconds>       Delay between retries (default: 5)
  --auth-header <header>  Additional Authorization header value
EOF
}

BASE_URL=""
HEALTH_PATH="/health"
SMOKE_PATH="/api/v1/health"
RETRIES=5
DELAY=5
AUTH_HEADER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --health-path)
      HEALTH_PATH="$2"
      shift 2
      ;;
    --smoke-path)
      SMOKE_PATH="$2"
      shift 2
      ;;
    --retries)
      RETRIES="$2"
      shift 2
      ;;
    --delay)
      DELAY="$2"
      shift 2
      ;;
    --auth-header)
      AUTH_HEADER="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  echo "--base-url is required" >&2
  usage
  exit 1
fi

curl_with_retry() {
  local url="$1"
  for (( attempt=1; attempt<=RETRIES; attempt++ )); do
    if [[ -n "$AUTH_HEADER" ]]; then
      if curl --fail --silent --show-error -H "Authorization: $AUTH_HEADER" "$url" >/dev/null; then
        return 0
      fi
    else
      if curl --fail --silent --show-error "$url" >/dev/null; then
        return 0
      fi
    fi
    echo "Attempt $attempt for $url failed, retrying in $DELAY seconds..."
    sleep "$DELAY"
  done
  echo "Smoke test failed for $url" >&2
  return 1
}

curl_with_retry "${BASE_URL%/}${HEALTH_PATH}"
curl_with_retry "${BASE_URL%/}${SMOKE_PATH}"

echo "Smoke tests completed successfully against $BASE_URL"
