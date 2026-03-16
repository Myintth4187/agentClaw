# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkillClaw is a multi-tenant AI skill development platform built on OpenClaw. It uses a **multi-agent architecture** where all users share a single OpenClaw Gateway instance, with each user getting an Agent that runs in an isolated Docker sandbox container.

**Architecture Flow:**
```
Browser (Frontend :3080)
    → Platform Gateway (FastAPI :8080)
        → Shared OpenClaw Instance (single container)
            → Agent Sandboxes (per-user Docker containers)
                → LLM Providers (via Gateway proxy with API key injection)
```

**Multi-Agent Architecture:**
- Single OpenClaw Gateway serves all users
- Each user = one Agent with sandbox isolation
- Session routing via `agent:<userId>:<sessionKey>` format
- Agent sandboxes auto-pruned after 2 hours idle (configurable via `FRAMECLAW_AGENTS__DEFAULTS__SANDBOX__PRUNE__IDLEHOURS`)

## Development Commands

### Local Development (All Services)
```bash
# Start all services (PostgreSQL, Bridge, Gateway, Frontend)
python start_local.py

# Start specific services only
python start_local.py --only db,gateway,frontend

# Skip specific services
python start_local.py --skip bridge

# Stop all services
python start_local.py --stop
```

### Docker Deployment
```bash
# Prepare environment
python prepare.py

# Build and start all services
docker compose up -d --build

# Rebuild bridge image (after Dockerfile/entrypoint.sh changes)
docker build -t openclaw:latest ./bridge/
docker compose up -d --force-recreate openclaw-shared

# Rebuild bridge TypeScript only (fast, no image rebuild needed)
cd bridge && npx tsc
docker compose restart openclaw-shared

# Remove stale sandbox containers
docker ps -a --filter "name=openclaw-sbx" --format "{{.Names}}" | xargs -r docker rm -f

# View logs
docker compose logs -f

# Check service status
python check_status.py
```

### Platform Gateway (Python/FastAPI)
```bash
cd platform
# Install dependencies
pip install -e .[dev]

# Run with auto-reload
export PLATFORM_DATABASE_URL="postgresql+asyncpg://frameclaw:frameclaw@localhost:5432/frameclaw_platform"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

# Run tests
pytest
```

### Frontend (Vite/React/TypeScript)
```bash
cd frontend
npm install
npm run dev      # Development server on port 3080
npm run build    # Production build
npm run lint     # ESLint
```

### OpenClaw Bridge (TypeScript/Node.js)
```bash
cd bridge
npm install
tsx start.ts          # Start bridge + OpenClaw Gateway (dev mode)

# Build bridge
npx tsc
```

## Key Components

### Platform Gateway (`platform/`)
Python FastAPI application - the control center for multi-tenant management.

| Module | File | Purpose |
|--------|------|---------|
| Auth | `app/auth/service.py` | JWT + bcrypt authentication |
| Shared Container | `app/container/shared_manager.py` | Manages shared OpenClaw instance |
| LLM Proxy | `app/llm_proxy/service.py` | API key injection, quota checking, usage tracking |
| HTTP/WS Proxy | `app/routes/proxy.py` | Forward requests to shared instance with agentId routing |

**Agent Lifecycle:**
- User registers → `agents.create` (Agent created in shared instance)
- User chats → Sandbox container created per-agent (lazy)
- Idle 24h → Sandbox auto-pruned (OpenClaw native)
- User deleted → `agents.delete` (Agent + sandbox + files removed)

### OpenClaw Bridge (`bridge/`)
Adapter layer connecting Platform Gateway to OpenClaw Agent Engine.

| File | Purpose |
|------|---------|
| `start.ts` | Entry point: write config → start OpenClaw Gateway → start HTTP server |
| `server.ts` | Express HTTP server + WebSocket relay with agentId extraction |
| `gateway-client.ts` | WS client to local OpenClaw Gateway (Ed25519 handshake) |
| `config.ts` | Environment variable parsing, config file generation (sandbox config here) |
| `utils.ts` | sessionKey conversion: `toOpenclawSessionKey(id, agentId)` → `agent:<agentId>:<id>` |
| `routes/skills.ts` | Skill listing — non-main agents filtered to workspace + skill-creator only |
| `routes/filemanager.ts` | File browser — routes to `workspace-<agentId>/` for per-user isolation |
| `routes/*.ts` | REST API endpoints (sessions, agents, plugins, etc.) |
| `entrypoint.sh` | Container startup: sync platform skills + skill-creator from openclaw builtins |
| `Dockerfile` | Builds `openclaw:latest` image (uses aliyun mirrors for China) |

### Frontend (`frontend/`)
Vite + React + TypeScript web interface with Tailwind CSS.

Key pages: Dashboard, Chat, Sessions, Agents, SkillStore, AIModels, Login/Register.

## Environment Configuration

Create `.env` in project root (see `.env.example`):

```bash
# Required: At least one LLM provider API key
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
DASHSCOPE_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx

# Optional: Default model for new users
DEFAULT_MODEL=dashscope/qwen3-coder-plus

# Security: JWT signing secret (change in production!)
JWT_SECRET=your-secure-random-string

# Self-hosted vLLM (optional)
HOSTED_VLLM_API_KEY=dummy
HOSTED_VLLM_API_BASE=http://localhost:8000/v1
```

## Service Ports

| Service | Port | Access |
|---------|------|--------|
| Frontend | 3080 | Public |
| Gateway | 8080 | Public |
| PostgreSQL | 15432 (Docker) / 5432 (local) | Internal |
| Bridge (container) | 18080 | Internal |
| OpenClaw Gateway (container) | 18789 | Loopback only |

## Security Architecture

- **API Keys**: All LLM API keys exist ONLY in Gateway environment variables. Agent sandboxes access LLMs via proxy.
- **Agent Isolation**: Each user gets an Agent with sandbox container isolation (Docker containers).
- **Skill Visibility**: Non-main agents only see `workspace` skills + `skill-creator`. All other builtin/global skills are hidden.
- **Authentication Chain**: Frontend JWT → Gateway → X-Agent-Id header → Agent routing.
- **Network**: Shared OpenClaw and agent sandboxes run in `openclaw-internal` network.
- **Sandbox Cleanup**: OpenClaw native `prune.idleHours` auto-cleans idle sandboxes (default: 2 hours).

## Sandbox Configuration

Sandbox settings live in `bridge/config.ts` under `agents.defaults.sandbox`:

```json
{
  "mode": "all",
  "scope": "agent",
  "workspaceAccess": "rw",
  "docker": {
    "readOnlyRoot": false
  }
}
```

**Important gotchas:**
- `sandbox.readOnlyRoot` is invalid — must use `sandbox.docker.readOnlyRoot`
- `sandbox.tools.fs.workspaceOnly` is invalid (not in schema)
- File isolation is enforced by scoping each agent to `workspace-<agentId>/`

## Data Storage

All persistent data lives at `~/.openclaw/` on the host, bind-mounted with the **same path** inside the openclaw-shared container:

```yaml
volumes:
  - ${HOME}/.openclaw:${HOME}/.openclaw
environment:
  OPENCLAW_HOME: ${HOME}/.openclaw
```

**Why same path?** When openclaw creates sandbox containers via Docker API, the bind mount source path must resolve on the Docker host (not inside the container). Using the same path on both sides ensures sandbox workspaces mount correctly.

Per-user workspaces: `~/.openclaw/workspace-<agentId>/`

## SkillClaw Agent Persona

The SOUL.md template for regular users is defined in `platform/app/routes/auth.py` (`SKILLCLAW_SOUL_MD`).

To update existing agents after changing SOUL.md:
```bash
python3 -c "
import re, glob, os
soul = open('platform/app/routes/auth.py').read()
m = re.search(r\"SKILLCLAW_SOUL_MD = '''(.*?)'''\", soul, re.DOTALL)
if m:
    for ws in glob.glob(os.path.expanduser('~/.openclaw/workspace-*')):
        with open(os.path.join(ws, 'SOUL.md'), 'w') as f: f.write(m.group(1))
        print(f'Updated: {ws}')
"
```

## Frontend Build Notes

**Important:** The frontend is a static build (Vite → Nginx). After modifying frontend source files, you must rebuild and copy to the container:

```bash
cd frontend
npm run build                           # Build production bundle
docker cp dist/. openclaw-frontend:/usr/share/nginx/html/  # Copy to container
```

For Docker deployments, the frontend is built during image creation. Changes to source files require rebuilding the image or manually copying as shown above.

## WebSocket Protocol

Frontend → Gateway → Bridge → OpenClaw Gateway (layered proxy):

```json
// Send message
{ "type": "req", "id": 1, "method": "chat.send", "params": { "sessionKey": "...", "message": "..." } }

// Receive event
{ "type": "event", "event": "chat.message.received", "payload": { "content": "..." } }

// Heartbeat
{ "type": "ping" } / { "type": "pong" }
```
