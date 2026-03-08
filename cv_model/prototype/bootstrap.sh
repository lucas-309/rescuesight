#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SKIP_INSTALL=false
RUN_TESTS=false
RUN_SERVICE=true
RUN_WEBCAM=true
SERVICE_HOST="${SERVICE_HOST:-127.0.0.1}"
SERVICE_PORT="${SERVICE_PORT:-8091}"
LIVE_POST_URL="${LIVE_POST_URL:-}"
LIVE_SOURCE_DEVICE_ID="${LIVE_SOURCE_DEVICE_ID:-}"
LIVE_LOCATION_LABEL="${LIVE_LOCATION_LABEL:-}"
LIVE_LOCATION_LAT="${LIVE_LOCATION_LAT:-}"
LIVE_LOCATION_LON="${LIVE_LOCATION_LON:-}"
LIVE_LOCATION_ACCURACY="${LIVE_LOCATION_ACCURACY:-}"
LIVE_LOCATION_INDOOR="${LIVE_LOCATION_INDOOR:-}"
WEBCAM_ARGS=()
SERVICE_PID=""

cleanup() {
  if [ -n "${SERVICE_PID}" ]; then
    kill "${SERVICE_PID}" >/dev/null 2>&1 || true
    wait "${SERVICE_PID}" 2>/dev/null || true
    SERVICE_PID=""
  fi
}

trap cleanup EXIT INT TERM

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
  --run-tests)
      RUN_TESTS=true
      shift
      ;;
    --all)
      RUN_SERVICE=true
      RUN_WEBCAM=true
      shift
      ;;
    --service-only)
      RUN_SERVICE=true
      RUN_WEBCAM=false
      shift
      ;;
    --webcam-only)
      RUN_SERVICE=false
      RUN_WEBCAM=true
      shift
      ;;
    --no-service)
      RUN_SERVICE=false
      shift
      ;;
    --no-webcam)
      RUN_WEBCAM=false
      shift
      ;;
    --service-host)
      if [ "$#" -lt 2 ]; then
        echo "--service-host requires a value" >&2
        exit 1
      fi
      SERVICE_HOST="$2"
      shift 2
      ;;
    --service-port)
      if [ "$#" -lt 2 ]; then
        echo "--service-port requires a value" >&2
        exit 1
      fi
      SERVICE_PORT="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./bootstrap.sh [options] [-- <run_webcam_args...>]

Creates/activates .venv, installs requirements, optionally runs tests,
and launches CV runtime components.

Options:
  --skip-install   Do not run pip install -r requirements.txt
  --run-tests      Run python -m unittest test_cv_signals.py test_cv_hooks.py test_hitl_flow.py test_webcam_voice_agent.py
  --all            Run cv_service.py + run_webcam.py (default)
  --service-only   Run only cv_service.py
  --webcam-only    Run only run_webcam.py
  --no-service     Disable cv_service.py launch
  --no-webcam      Disable run_webcam.py launch
  --service-host   CV service bind host (default: 127.0.0.1)
  --service-port   CV service bind port (default: 8091)
  --               Pass all following args to run_webcam.py

Environment passthrough to run_webcam.py:
  LIVE_POST_URL, LIVE_SOURCE_DEVICE_ID,
  LIVE_LOCATION_LABEL, LIVE_LOCATION_LAT, LIVE_LOCATION_LON,
  LIVE_LOCATION_ACCURACY, LIVE_LOCATION_INDOOR
EOF
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        WEBCAM_ARGS+=("$1")
        shift
      done
      ;;
    *)
      WEBCAM_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ -n "${LIVE_POST_URL}" ]; then
  WEBCAM_ARGS+=(--post-url "${LIVE_POST_URL}")
fi
if [ -n "${LIVE_SOURCE_DEVICE_ID}" ]; then
  WEBCAM_ARGS+=(--source-device-id "${LIVE_SOURCE_DEVICE_ID}")
fi
if [ -n "${LIVE_LOCATION_LABEL}" ]; then
  WEBCAM_ARGS+=(--location-label "${LIVE_LOCATION_LABEL}")
fi
if [ -n "${LIVE_LOCATION_LAT}" ]; then
  WEBCAM_ARGS+=(--location-lat "${LIVE_LOCATION_LAT}")
fi
if [ -n "${LIVE_LOCATION_LON}" ]; then
  WEBCAM_ARGS+=(--location-lon "${LIVE_LOCATION_LON}")
fi
if [ -n "${LIVE_LOCATION_ACCURACY}" ]; then
  WEBCAM_ARGS+=(--location-accuracy "${LIVE_LOCATION_ACCURACY}")
fi
if [ -n "${LIVE_LOCATION_INDOOR}" ]; then
  WEBCAM_ARGS+=(--location-indoor "${LIVE_LOCATION_INDOOR}")
fi

if [ "${RUN_SERVICE}" = false ] && [ "${RUN_WEBCAM}" = false ] && [ "${RUN_TESTS}" = false ]; then
  echo "Nothing to run: both service and webcam are disabled." >&2
  exit 1
fi

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python executable not found: ${PYTHON_BIN}" >&2
  exit 1
fi

if [ ! -d "${VENV_DIR}" ]; then
  echo "Creating virtual environment at ${VENV_DIR}"
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
else
  echo "Using existing virtual environment at ${VENV_DIR}"
fi

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

if [ "${SKIP_INSTALL}" = false ]; then
  echo "Upgrading pip"
  python -m pip install --upgrade pip
  echo "Installing requirements"
  python -m pip install -r "${SCRIPT_DIR}/requirements.txt"
else
  echo "Skipping dependency installation"
fi

if [ "${RUN_TESTS}" = true ]; then
  echo "Running CV unit tests"
  cd "${SCRIPT_DIR}"
  python -m unittest test_cv_signals.py test_cv_hooks.py test_hitl_flow.py test_webcam_voice_agent.py
fi

if [ "${RUN_SERVICE}" = false ] && [ "${RUN_WEBCAM}" = false ]; then
  echo "Bootstrap completed (tests only)."
  exit 0
fi

cd "${SCRIPT_DIR}"

if [ "${RUN_SERVICE}" = true ] && [ "${RUN_WEBCAM}" = true ]; then
  echo "Launching CV service in background at http://${SERVICE_HOST}:${SERVICE_PORT}"
  python cv_service.py --host "${SERVICE_HOST}" --port "${SERVICE_PORT}" &
  SERVICE_PID="$!"
  sleep 0.6
  if ! kill -0 "${SERVICE_PID}" >/dev/null 2>&1; then
    echo "CV service failed to start." >&2
    exit 1
  fi
  echo "Set API env if needed: export RESCUESIGHT_CV_SERVICE_URL=\"http://${SERVICE_HOST}:${SERVICE_PORT}\""
  echo "Launching webcam prototype"
  if [ "${#WEBCAM_ARGS[@]}" -gt 0 ]; then
    python run_webcam.py "${WEBCAM_ARGS[@]}"
  else
    python run_webcam.py
  fi
  exit $?
fi

if [ "${RUN_SERVICE}" = true ]; then
  echo "Launching CV service at http://${SERVICE_HOST}:${SERVICE_PORT}"
  exec python cv_service.py --host "${SERVICE_HOST}" --port "${SERVICE_PORT}"
fi

echo "Launching webcam prototype"
if [ "${#WEBCAM_ARGS[@]}" -gt 0 ]; then
  exec python run_webcam.py "${WEBCAM_ARGS[@]}"
fi
exec python run_webcam.py
