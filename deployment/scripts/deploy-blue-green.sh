#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deploy-blue-green.sh --environment <env> --host <host> --user <user> --key <private-key-path> \
  --deploy-path </remote/path> --backend-image <image> --frontend-image <image> --healthcheck-url <url>

Required environment variables (can also be passed as flags):
  DEPLOY_MIGRATION_COMMAND   Command executed inside the backend container to apply DB migrations
  DEPLOY_ROLLBACK_COMMAND    Command executed to roll back the last migration batch when deployment fails
EOF
}

ENVIRONMENT=""
SSH_HOST=""
SSH_USER=""
SSH_KEY=""
DEPLOY_PATH="/opt/love-parser"
BACKEND_IMAGE=""
FRONTEND_IMAGE=""
HEALTHCHECK_URL=""
SSH_PORT="22"
SLOT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --host)
      SSH_HOST="$2"
      shift 2
      ;;
    --user)
      SSH_USER="$2"
      shift 2
      ;;
    --key)
      SSH_KEY="$2"
      shift 2
      ;;
    --deploy-path)
      DEPLOY_PATH="$2"
      shift 2
      ;;
    --backend-image)
      BACKEND_IMAGE="$2"
      shift 2
      ;;
    --frontend-image)
      FRONTEND_IMAGE="$2"
      shift 2
      ;;
    --healthcheck-url)
      HEALTHCHECK_URL="$2"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="$2"
      shift 2
      ;;
    --slot-file)
      SLOT_FILE="$2"
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

if [[ -z "$ENVIRONMENT" || -z "$SSH_HOST" || -z "$SSH_USER" || -z "$SSH_KEY" || -z "$BACKEND_IMAGE" || -z "$FRONTEND_IMAGE" ]]; then
  echo "Missing required arguments" >&2
  usage
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key $SSH_KEY does not exist" >&2
  exit 1
fi

SLOT_FILE=${SLOT_FILE:-"$DEPLOY_PATH/.active_slot"}
MIGRATION_COMMAND=${DEPLOY_MIGRATION_COMMAND:-"npm run db:migrate"}
ROLLBACK_COMMAND=${DEPLOY_ROLLBACK_COMMAND:-"npm run db:rollback"}
MIGRATION_COMMAND_B64=$(printf '%s' "$MIGRATION_COMMAND" | base64 | tr -d '\n')
ROLLBACK_COMMAND_B64=$(printf '%s' "$ROLLBACK_COMMAND" | base64 | tr -d '\n')

ssh_opts=("-i" "$SSH_KEY" "-o" "StrictHostKeyChecking=no" "-o" "UserKnownHostsFile=/dev/null" "-p" "$SSH_PORT")

current_slot=$(ssh "${ssh_opts[@]}" "$SSH_USER@$SSH_HOST" "if [ -f '$SLOT_FILE' ]; then cat '$SLOT_FILE'; else echo blue; fi" | tr -d '\r')
if [[ "$current_slot" != "blue" && "$current_slot" != "green" ]]; then
  current_slot="blue"
fi

target_slot="green"
if [[ "$current_slot" == "green" ]]; then
  target_slot="blue"
fi

compose_file="$DEPLOY_PATH/docker-compose.$target_slot.yml"
previous_compose="$DEPLOY_PATH/docker-compose.$current_slot.yml"

echo "Deploying $ENVIRONMENT environment: active slot=$current_slot, target slot=$target_slot"

ssh "${ssh_opts[@]}" "$SSH_USER@$SSH_HOST" \
  "ENVIRONMENT='$ENVIRONMENT' COMPOSE_FILE='$compose_file' PREVIOUS_COMPOSE='$previous_compose' SLOT_FILE='$SLOT_FILE' \
  BACKEND_IMAGE='$BACKEND_IMAGE' FRONTEND_IMAGE='$FRONTEND_IMAGE' TARGET_SLOT='$target_slot' CURRENT_SLOT='$current_slot' \
  MIGRATION_COMMAND_B64='$MIGRATION_COMMAND_B64' ROLLBACK_COMMAND_B64='$ROLLBACK_COMMAND_B64' HEALTHCHECK_URL='$HEALTHCHECK_URL' bash -s" <<'EOF'
set -euo pipefail
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file $COMPOSE_FILE is missing" >&2
  exit 1
fi

decode_cmd() {
  printf '%s' "$1" | base64 -d
}

MIGRATION_COMMAND=$(decode_cmd "$MIGRATION_COMMAND_B64")
ROLLBACK_COMMAND=$(decode_cmd "$ROLLBACK_COMMAND_B64")

deploy_slot() {
  docker compose -f "$COMPOSE_FILE" pull backend frontend
  docker compose -f "$COMPOSE_FILE" up -d backend frontend
}

teardown_slot() {
  docker compose -f "$COMPOSE_FILE" exec backend sh -c "$ROLLBACK_COMMAND" || true
  docker compose -f "$COMPOSE_FILE" down --remove-orphans || true
}

reactivate_previous() {
  if [[ -f "$PREVIOUS_COMPOSE" ]]; then
    docker compose -f "$PREVIOUS_COMPOSE" up -d backend frontend || true
  fi
}

fail_and_rollback() {
  echo "Rolling back to slot $CURRENT_SLOT" >&2
  teardown_slot
  reactivate_previous
  exit 1
}

healthcheck() {
  if [[ -z "$HEALTHCHECK_URL" ]]; then
    return 0
  fi
  curl --fail --retry 5 --retry-delay 3 --max-time 10 "$HEALTHCHECK_URL" >/dev/null
}

set +e
deploy_slot
if [[ $? -ne 0 ]]; then
  echo "Failed to start Docker Compose stack" >&2
  fail_and_rollback
fi

set -e
if ! docker compose -f "$COMPOSE_FILE" exec backend sh -c "$MIGRATION_COMMAND"; then
  echo "Database migration failed" >&2
  fail_and_rollback
fi

if ! healthcheck; then
  echo "Health check failed" >&2
  fail_and_rollback
fi

echo "$TARGET_SLOT" > "$SLOT_FILE"
if [[ -f "$PREVIOUS_COMPOSE" ]]; then
  docker compose -f "$PREVIOUS_COMPOSE" down --remove-orphans || true
fi
EOF

echo "Blue/green deployment succeeded. Active slot switched to $target_slot"
