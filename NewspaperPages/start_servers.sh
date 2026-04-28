#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
BACKEND_VENV="${BACKEND_DIR}/.venv"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5500}"
FRONTEND_BIND="${FRONTEND_BIND:-0.0.0.0}"
RUN_DIR="${ROOT_DIR}/.run"
LOG_DIR="${ROOT_DIR}/logs"
BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"
BACKEND_LOG_FILE="${LOG_DIR}/backend.log"
FRONTEND_LOG_FILE="${LOG_DIR}/frontend.log"
ZEROTIER_IP="${ZEROTIER_IP:-10.159.67.31}"
SKIP_ZEROTIER_CHECK="${SKIP_ZEROTIER_CHECK:-0}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required but not found."
  exit 1
fi

ensure_backend_env() {
  mkdir -p "${RUN_DIR}" "${LOG_DIR}"
  if [[ ! -d "${BACKEND_VENV}" ]]; then
    echo "Creating backend virtual environment..."
    python3 -m venv "${BACKEND_VENV}"
  fi
  echo "Checking backend dependencies..."
  "${BACKEND_VENV}/bin/python" -c "import flask" >/dev/null 2>&1 || \
    "${BACKEND_VENV}/bin/pip" install -r "${BACKEND_DIR}/requirements.txt"
}

read_pid() {
  local pid_file="$1"
  if [[ -f "${pid_file}" ]]; then
    tr -d '[:space:]' < "${pid_file}"
  fi
}

is_pid_alive() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

check_zerotier() {
  if [[ "${SKIP_ZEROTIER_CHECK}" == "1" ]]; then
    echo "ZeroTier check skipped (SKIP_ZEROTIER_CHECK=1)."
    return 0
  fi

  if ! command -v zerotier-cli >/dev/null 2>&1; then
    echo "Error: zerotier-cli not found. Install ZeroTier or set SKIP_ZEROTIER_CHECK=1."
    exit 1
  fi

  local zt_status
  zt_status="$(zerotier-cli status 2>/dev/null || true)"
  if [[ -z "${zt_status}" ]] || [[ "${zt_status}" != *"ONLINE"* ]]; then
    echo "Error: ZeroTier is not online. Current status: ${zt_status:-unknown}"
    exit 1
  fi

  if ! ifconfig | grep -Eq "inet ${ZEROTIER_IP}([[:space:]]|$)"; then
    echo "Error: ZeroTier IP ${ZEROTIER_IP} not found on this machine."
    echo "Set ZEROTIER_IP=<your-ip> or SKIP_ZEROTIER_CHECK=1 to bypass."
    exit 1
  fi

  echo "ZeroTier check passed (IP ${ZEROTIER_IP})."
}

start_servers() {
  check_zerotier
  ensure_backend_env

  local backend_pid
  backend_pid="$(read_pid "${BACKEND_PID_FILE}")"
  local frontend_pid
  frontend_pid="$(read_pid "${FRONTEND_PID_FILE}")"

  if is_pid_alive "${backend_pid}" || is_pid_alive "${frontend_pid}"; then
    echo "Servers already running. Use '$0 status' or '$0 restart'."
    return 0
  fi

  echo "Starting backend on port ${BACKEND_PORT}..."
  (
    cd "${BACKEND_DIR}"
    nohup env BACKEND_PORT="${BACKEND_PORT}" "${BACKEND_VENV}/bin/python" app.py >> "${BACKEND_LOG_FILE}" 2>&1 &
    echo $! > "${BACKEND_PID_FILE}"
  )

  echo "Starting frontend on ${FRONTEND_BIND}:${FRONTEND_PORT}..."
  (
    cd "${ROOT_DIR}"
    nohup python3 -m http.server "${FRONTEND_PORT}" --bind "${FRONTEND_BIND}" >> "${FRONTEND_LOG_FILE}" 2>&1 &
    echo $! > "${FRONTEND_PID_FILE}"
  )

  sleep 0.5
  status_servers
}

stop_process() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "${pid_file}")"

  if ! is_pid_alive "${pid}"; then
    rm -f "${pid_file}"
    echo "${name}: not running"
    return 0
  fi

  kill "${pid}" >/dev/null 2>&1 || true
  sleep 0.3
  if is_pid_alive "${pid}"; then
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "${pid_file}"
  echo "${name}: stopped"
}

stop_servers() {
  stop_process "Backend" "${BACKEND_PID_FILE}"
  stop_process "Frontend" "${FRONTEND_PID_FILE}"
}

status_servers() {
  local backend_pid
  backend_pid="$(read_pid "${BACKEND_PID_FILE}")"
  local frontend_pid
  frontend_pid="$(read_pid "${FRONTEND_PID_FILE}")"

  if is_pid_alive "${backend_pid}"; then
    echo "Backend: running (pid ${backend_pid}) at http://127.0.0.1:${BACKEND_PORT}"
  else
    echo "Backend: not running"
  fi

  if is_pid_alive "${frontend_pid}"; then
    echo "Frontend: running (pid ${frontend_pid}) at http://127.0.0.1:${FRONTEND_PORT}/frontend/index.html"
  else
    echo "Frontend: not running"
  fi

  echo "Logs: ${BACKEND_LOG_FILE} and ${FRONTEND_LOG_FILE}"
}

show_logs() {
  mkdir -p "${LOG_DIR}"
  touch "${BACKEND_LOG_FILE}" "${FRONTEND_LOG_FILE}"
  echo "== Backend log =="
  tail -n 30 "${BACKEND_LOG_FILE}" || true
  echo ""
  echo "== Frontend log =="
  tail -n 30 "${FRONTEND_LOG_FILE}" || true
}

interactive_shell() {
  echo "Interactive mode. Commands: start, stop, restart, status, logs, exit"
  while true; do
    printf "> "
    read -r cmd || break
    case "${cmd}" in
      start) start_servers ;;
      stop) stop_servers ;;
      restart) stop_servers; start_servers ;;
      status) status_servers ;;
      logs) show_logs ;;
      exit|quit) break ;;
      "") ;;
      *) echo "Unknown command: ${cmd}" ;;
    esac
  done
}

case "${1:-start}" in
  start) start_servers ;;
  stop) stop_servers ;;
  restart) stop_servers; start_servers ;;
  status) status_servers ;;
  logs) show_logs ;;
  shell) interactive_shell ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|shell}"
    exit 1
    ;;
esac
