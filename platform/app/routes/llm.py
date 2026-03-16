"""LLM Proxy API routes — OpenAI-compatible chat/completions endpoint.

User containers hit this endpoint instead of calling LLM providers
directly.  The container token is sent as the Bearer token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import get_db
from app.llm_proxy.service import proxy_chat_completion

router = APIRouter(prefix="/llm/v1", tags=["llm-proxy"])


class ChatMessage(BaseModel):
    role: str
    content: str | list | None = None
    tool_calls: list | None = None
    tool_call_id: str | None = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    max_tokens: int = 4096
    temperature: float = 0.7
    tools: list[dict] | None = None
    tool_choice: str | None = None
    stream: bool = False


@router.post("/chat/completions")
async def chat_completions(
    request: Request,
    authorization: str = Header(...),
    x_agent_id: str | None = Header(None, alias="X-Agent-Id"),
    db: AsyncSession = Depends(get_db),
):
    """OpenAI-compatible chat completions endpoint for container proxying.

    Supports two modes:
    1. Multi-agent: X-Agent-Id header identifies the user (shared OpenClaw instance)
    2. Legacy: Bearer token identifies the container or user
    """
    import json as _json

    # Extract container token from "Bearer <token>" header
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    container_token = authorization[7:]

    raw_body = await request.body()
    raw_json = _json.loads(raw_body)

    # Use max_completion_tokens if provided (OpenAI standard), falling back to max_tokens
    max_tokens = raw_json.get("max_completion_tokens") or raw_json.get("max_tokens", 4096)

    result = await proxy_chat_completion(
        db=db,
        container_token=container_token,
        agent_id=x_agent_id,  # Pass agent_id for multi-agent routing
        model=raw_json.get("model", ""),
        messages=raw_json.get("messages", []),  # pass raw messages to preserve all fields (e.g. reasoning_content)
        max_tokens=max_tokens,
        temperature=raw_json.get("temperature", 0.7),
        tools=raw_json.get("tools"),
        stream=raw_json.get("stream", False),
    )

    # Streaming: return SSE response
    if raw_json.get("stream", False):
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            result,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return result


# Native Claude protocol endpoint (/v1/messages)
@router.post("/messages")
async def claude_messages(
    request: Request,
    authorization: str = Header(...),
    x_agent_id: str | None = Header(None, alias="X-Agent-Id"),
    db: AsyncSession = Depends(get_db),
):
    """Native Anthropic Claude API endpoint for direct Claude protocol access.

    This endpoint accepts native Claude format and forwards to the configured
    Claude-compatible backend (e.g., custom Claude endpoint or proxy).
    """
    import json as _json
    from app.llm_proxy.claude_adapter import proxy_claude_messages

    # Extract container token from "Bearer <token>" header
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    container_token = authorization[7:]

    raw_body = await request.body()
    raw_json = _json.loads(raw_body)

    result = await proxy_claude_messages(
        db=db,
        container_token=container_token,
        agent_id=x_agent_id,
        body=raw_json,
    )

    return result
