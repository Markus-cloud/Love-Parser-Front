#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: rollback.sh --host <host> --user <user> --key <private-key> [--target-slot blue|green] [--deploy-path /opt/love-parser]
Optional environment variables:
  DEPLOY_ROLLBACK_COMMAND  Command executed inside the backend container during rollback (defaults to pnpm --filter @love-parser/backend db:rollback)
EOF
}

SSH_HOST=""
SSH_USER=""
SSH_KEY=""
DEPLOY_PATH="/opt/love-parser"
TARGET_SLOT=""
SSH_PORT="22"
SLOT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --target-slot)
      TARGET_SLOT="$2"
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

if [[ -z "$SSH_HOST" || -z "$SSH_USER" || -z "$SSH_KEY" ]]; then
  echo "Missing SSH arguments" >&2
  usage
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key $SSH_KEY not found" >&2
  exit 1
fi

SLOT_FILE=${SLOT_FILE:-"$DEPLOY_PATH/.active_slot"}
ROLLBACK_COMMAND=${DEPLOY_ROLLBACK_COMMAND:-"npm run db:rollback"}
ROLLBACK_COMMAND_B64=$(printf '%s' "$ROLLBACK_COMMAND" | base64 | tr -d '\n')

ssh_opts=("-i" "$SSH_KEY" "-o" "StrictHostKeyChecking=no" "-o" "UserKnownHostsFile=/dev/null" "-p" "$SSH_PORT")

current_slot=$(ssh "${ssh_opts[@]}" "$SSH_USER@$SSH_HOST" "if [ -f '$SLOT_FILE' ]; then cat '$SLOT_FILE'; else echo blue; fi" | tr -d '\r')
if [[ -z "$TARGET_SLOT" ]]; then
  if [[ "$current_slot" == "green" ]]; then
    TARGET_SLOT="blue"
  else
    TARGET_SLOT="green"
  fi
fi

if [[ "$TARGET_SLOT" != "blue" && "$TARGET_SLOT" != "green" ]]; then
  echo "Invalid target slot: $TARGET_SLOT" >&2
  exit 1
fi

compose_target="$DEPLOY_PATH/docker-compose.$TARGET_SLOT.yml"
compose_current="$DEPLOY_PATH/docker-compose.$current_slot.yml"

echo "Rolling back deployment: current slot=$current_slot, target slot=$TARGET_SLOT"

ssh "${ssh_opts[@]}" "$SSH_USER@$SSH_HOST" \
  "TARGET_SLOT='$TARGET_SLOT' CURRENT_SLOT='$current_slot' SLOT_FILE='$SLOT_FILE' \
  COMPOSE_TARGET='$compose_target' COMPOSE_CURRENT='$compose_current' ROLLBACK_COMMAND_B64='$ROLLBACK_COMMAND_B64' bash -s" <<'EOF'
set -euo pipefail
if [[ ! -f "$COMPOSE_TARGET" ]]; then
  echo "Compose file $COMPOSE_TARGET is missing" >&2
  exit 1
fi

decode_cmd() {
  printf '%s' "$1" | base64 -d
}

ROLLBACK_COMMAND=$(decode_cmd "$ROLLBACK_COMMAND_B64")

docker compose -f "$COMPOSE_TARGET" up -d backend frontend
if [[ -f "$COMPOSE_CURRENT" && "$COMPOSE_CURRENT" != "$COMPOSE_TARGET" ]]; then
  docker compose -f "$COMPOSE_CURRENT" exec backend sh -c "$ROLLBACK_COMMAND" || true
  docker compose -f "$COMPOSE_CURRENT" down --remove-orphans || true
fi

echo "$TARGET_SLOT" > "$SLOT_FILE"
echo "Rollback complete. Active slot: $TARGET_SLOT"
EOF
