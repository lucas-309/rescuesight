#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SKIP_INSTALL=false
SKIP_TESTS=false

for arg in "$@"; do
  case "$arg" in
    --skip-install)
      SKIP_INSTALL=true
      ;;
    --skip-tests)
      SKIP_TESTS=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./bootstrap.sh [--skip-install] [--skip-tests]

Creates/activates .venv, installs requirements, and runs CV unit tests.

Options:
  --skip-install   Do not run pip install -r requirements.txt
  --skip-tests     Do not run python -m unittest test_cv_signals.py
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      exit 1
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

if [ "${SKIP_TESTS}" = false ]; then
  echo "Running CV unit tests"
  cd "${SCRIPT_DIR}"
  python -m unittest test_cv_signals.py
else
  echo "Skipping test run"
fi

echo "Bootstrap complete."
