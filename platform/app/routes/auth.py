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
from app.personas import load_soul_md

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
                    json={"content": load_soul_md()},
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
