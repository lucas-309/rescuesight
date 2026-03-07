#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SKIP_INSTALL=false
RUN_TESTS=false
WEBCAM_ARGS=()

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
    -h|--help)
      cat <<'EOF'
Usage: ./bootstrap.sh [--skip-install] [--run-tests] [-- <run_webcam_args...>]

Creates/activates .venv, installs requirements, and runs run_webcam.py.

Options:
  --skip-install   Do not run pip install -r requirements.txt
  --run-tests      Run python -m unittest test_cv_signals.py before webcam
  --               Pass all following args to run_webcam.py
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
  python -m unittest test_cv_signals.py
fi

echo "Launching webcam prototype"
cd "${SCRIPT_DIR}"
if [ "${#WEBCAM_ARGS[@]}" -gt 0 ]; then
  exec python run_webcam.py "${WEBCAM_ARGS[@]}"
else
  exec python run_webcam.py
fi
