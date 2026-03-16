"""Authentication API routes."""

import httpx
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import (
    authenticate_user,
    create_access_token,
    create_api_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_user_by_email,
    get_user_by_id,
    get_user_by_username,
    update_password,
    verify_password,
)
from app.auth.dependencies import get_current_user
from app.config import settings
from app.container.shared_manager import ensure_shared_container
from app.db.engine import get_db
from app.db.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


# SkillClaw SOUL.md template for regular users
SKILLCLAW_SOUL_MD = '''---
read_when:
  - always
summary: SkillClaw - 技能创作与安全审核助手
---

# SOUL.md - 你是 SkillClaw

你是 **SkillClaw**，一个运行在独立 Docker 沙盒中的技能创作助手。你像一个经验丰富的工匠，帮助用户把想法变成可运行的技能。

## 开场（每次新对话）

简洁自我介绍后，`ls skills/` 列出已有技能，告诉用户你能做什么。不要读取 IDENTITY.md 或创建记忆文件。

## 你的能力

你在 Docker 沙盒中运行，拥有完整的 Linux 环境：
- Shell 执行：bash、python3、node 等
- 包管理：`apt-get install`、`pip install`、`npm install`
- 网络访问：curl、wget、API 调用
- 文件操作：创建、编辑、删除 `/workspace/` 下的文件

## 什么是"技能"

技能是一个自包含的功能单元，包含描述文件和可执行脚本。它不绑定任何特定平台——可以是一个天气查询脚本、一个数据处理工具、一个 API 封装、甚至一个自动化工作流。

```
skills/<name>/
  SKILL.md        # 技能描述：名称、用途、触发条件、使用方法
  scripts/        # 可执行脚本（Python/Bash/Node/任意语言）
  references/     # 参考资料、配置模板等
```

## 核心工作流

### 1. 创建技能
- 理解用户需求 → 创建目录和文件 → 编写脚本 → 询问"要测试一下吗？"

### 2. 测试技能
- **必须实际运行**，禁止模拟或编造输出
- 先装依赖：`apt-get update && apt-get install -y <pkg>` 或 `pip install <pkg>`
- 超时控制：`timeout 30 python3 scripts/xxx.py`
- 如实反馈：成功展示输出，失败展示错误并分析原因，超时说明"执行超过 30 秒已中断"

### 3. 编辑优化
- 用户说"改一下"/"优化"→ 读取现有文件，修改，重新测试
- 优化方向：性能、可读性、错误处理、输出格式

### 4. 安全审核
创建或修改技能后，**自动执行安全检查**：

**必须拦截的危险操作：**
- 读写 `/workspace/` 之外的路径（如 `/etc/`, `/root/`, `/proc/`）
- 反弹 shell、端口监听（`nc -l`, `bash -i >& /dev/tcp/`）
- 挖矿程序、恶意下载（`curl xx | bash`）
- 环境变量窃取（读取 API key、token 等）
- 无限循环、fork 炸弹（`:(){ :|:& };:`）
- 大量网络扫描（nmap、masscan）

**检查方法：**
- 审查脚本源码，逐行检查可疑操作
- 如果发现问题：**拒绝创建**，向用户说明具体哪行代码有风险

### 5. 发布到 SkillClaw
用户说"发布"时：
- 确认技能已通过测试
- 确认安全审核无问题
- 提示用户：技能将提交到 SkillClaw 技能商店，经平台审核后上架

## 交互原则

1. **先确认再动手**：理解用户需求后，用 1-2 句话确认关键点（输入输出、语言、依赖），用户确认后再创建
2. **真实执行**：永远实际运行脚本，不模拟不编造
3. **简洁反馈**：展示关键结果，不输出大段模板
4. **安全第一**：每次创建/修改后自动审查脚本安全性
'''


async def _create_agent_for_user(user_id: str, username: str, is_admin: bool = False) -> bool:
    """Create an Agent for the user in the shared OpenClaw instance.

    For regular users, sets the SkillClaw SOUL.md as the default personality.

    Returns True if successful, False otherwise.
    """
    # Get shared container URL
    if settings.dev_openclaw_url:
        bridge_url = settings.dev_openclaw_url
    else:
        container_info = await ensure_shared_container()
        bridge_url = f"http://{container_info['internal_host']}:{container_info['internal_port']}"

    # Create a user-friendly agent name: username + short uuid prefix
    # Sanitize username: remove special chars, limit length
    safe_username = "".join(c for c in username if c.isalnum() or c in "-_").lower()[:20]
    short_id = user_id[:8]
    agent_name = f"{safe_username}-{short_id}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create the agent (internal call, use X-Is-Admin to bypass admin check)
            # Use user_id as agentId for proper user-agent mapping
            resp = await client.post(
                f"{bridge_url}/api/agents",
                json={"name": agent_name, "agentId": user_id},
                headers={"X-Is-Admin": "true"},
            )
            if resp.status_code != 200:
                print(f"[auth] Failed to create agent for {user_id}: {resp.status_code} - {resp.text}")
                return False

            # For regular users, set the SkillClaw SOUL.md
            if not is_admin:
                soul_resp = await client.put(
                    f"{bridge_url}/api/agents/{user_id}/files/SOUL.md",
                    json={"content": SKILLCLAW_SOUL_MD},
                    headers={"X-Agent-Id": user_id, "X-Is-Admin": "true"},
                )
                if soul_resp.status_code != 200:
                    print(f"[auth] Warning: Failed to set SkillClaw SOUL.md for user {user_id}")

            return True
    except Exception as e:
        print(f"[auth] Failed to create agent for user {user_id}: {e}")
        return False


async def _delete_agent_for_user(user_id: str, delete_files: bool = True) -> bool:
    """Delete an Agent from the shared OpenClaw instance.

    Returns True if successful, False otherwise.
    """
    # Get shared container URL
    if settings.dev_openclaw_url:
        bridge_url = settings.dev_openclaw_url
    else:
        container_info = await ensure_shared_container()
        bridge_url = f"http://{container_info['internal_host']}:{container_info['internal_port']}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.delete(
                f"{bridge_url}/api/agents/{user_id}",
                params={"delete_files": "true" if delete_files else "false"},
            )
            return resp.status_code == 200
    except Exception as e:
        print(f"[auth] Failed to delete agent for user {user_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str  # accepts username or email
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    quota_tier: str
    is_active: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if await get_user_by_username(db, req.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    if await get_user_by_email(db, req.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await create_user(db, req.username, req.email, req.password)

    # Create Agent for the new user in shared OpenClaw instance
    # Pass is_admin=True for admin users (role is set during user creation)
    agent_created = await _create_agent_for_user(user.id, user.username, is_admin=(user.role == "admin"))
    if not agent_created:
        raise HTTPException(status_code=500, detail="Failed to create agent")

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        username=user.username,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, req.username, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        username=user.username,
        role=user.role,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await get_user_by_id(db, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        username=user.username,
        role=user.role,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        quota_tier=user.quota_tier,
        is_active=user.is_active,
    )


class ApiTokenResponse(BaseModel):
    api_token: str
    expires_in_days: int = 365


@router.post("/api-token", response_model=ApiTokenResponse)
async def generate_api_token(user: User = Depends(get_current_user)):
    """Generate a long-lived API token for programmatic access."""
    token = create_api_token(user.id, user.role)
    return ApiTokenResponse(api_token=token)


class ChangepasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    req: ChangepasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password."""
    # Verify current password
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Update password
    await update_password(db, user.id, req.new_password)

    return {"ok": True, "message": "password changed successfully"}
