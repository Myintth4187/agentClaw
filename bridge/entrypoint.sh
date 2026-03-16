#!/bin/bash
set -e

# Create necessary directories
mkdir -p ~/.openclaw/workspace
mkdir -p ~/.openclaw/uploads
mkdir -p ~/.openclaw/sessions
mkdir -p ~/.openclaw/skills

# Install platform built-in skills (always overwrite to keep up-to-date)
PLATFORM_SKILLS_DIR="/app/skills"
if [ -d "$PLATFORM_SKILLS_DIR" ]; then
  cp -r "$PLATFORM_SKILLS_DIR/"* ~/.openclaw/skills/ 2>/dev/null || true
  echo "[entrypoint] Platform skills synced"
fi

# Copy skill-creator from openclaw builtin skills
BUILTIN_SKILLS="$(npm root -g)/openclaw/skills"
if [ -d "$BUILTIN_SKILLS/skill-creator" ]; then
  cp -r "$BUILTIN_SKILLS/skill-creator" ~/.openclaw/skills/
  echo "[entrypoint] skill-creator synced from builtin"
fi

# If FRAMECLAW_PROXY__URL is set, we're running in platform mode
if [ -n "$FRAMECLAW_PROXY__URL" ]; then
  echo "[entrypoint] Platform mode detected"
  echo "[entrypoint] Proxy URL: $FRAMECLAW_PROXY__URL"
  echo "[entrypoint] Model: $FRAMECLAW_AGENTS__DEFAULTS__MODEL"
fi

exec "$@"
