#!/usr/bin/env bash
# Cloud agent install. Idempotent: safe to re-run on a snapshot that already
# has node_modules and uv. Invoked from the repository root by
# `.cursor/environment.json`.
set -euo pipefail

npm ci

# Install and start are non-interactive login shells. Ubuntu's ~/.bashrc
# returns immediately in that case, so a uv installer PATH edit under $HOME
# is invisible. Put the binaries on the default PATH instead.
# Pin the installer to the version verified in this environment (0.13.0).
if ! command -v uv >/dev/null 2>&1 || ! command -v uvx >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  curl -LsSf https://astral.sh/uv/0.13.0/install.sh | env UV_UNMANAGED_INSTALL="$tmp" sh
  uv_bin="$(find "$tmp" -type f -name uv -print -quit)"
  uvx_bin="$(find "$tmp" -type f -name uvx -print -quit)"
  sudo install -m 0755 "$uv_bin" /usr/local/bin/uv
  sudo install -m 0755 "$uvx_bin" /usr/local/bin/uvx
  rm -rf "$tmp"
fi

# resolve_customization.py declares requires-python >= 3.11 (stdlib tomllib).
# A uv-managed 3.12 keeps `uv run` working when the base image Python is older.
uv python install 3.12
