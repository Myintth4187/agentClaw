"""Claude native protocol adapter.

Translates between Anthropic's native /v1/messages API and the backend.
"""

from __future__ import annotations

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.llm_proxy.service import proxy_chat_completion


async def proxy_claude_messages(
    db: AsyncSession,
    container_token: str,
    body: dict,
    agent_id: str | None = None,
):
    """Proxy Claude native /v1/messages format to configured backend.

    Supports direct Claude protocol forwarding or translation to OpenAI format
    depending on backend configuration.
    """
    import logging

    model = body.get("model", "claude-opus-4-6")
    messages = body.get("messages", [])
    max_tokens = body.get("max_tokens", 4096)
    temperature = body.get("temperature", 0.7)
    tools = body.get("tools", [])
    stream = body.get("stream", False)

    # Check if we have a custom Claude endpoint configured
    if settings.claude_api_base:
        # Direct forwarding to custom Claude endpoint
        api_key = settings.claude_api_key or settings.anthropic_api_key or ""
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Claude API key not configured",
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        # Add Anthropic-specific headers if needed
        if "anthropic" in settings.claude_api_base.lower():
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = "2023-06-01"

        target_url = f"{settings.claude_api_base.rstrip('/')}/v1/messages"

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.post(
                    target_url,
                    json=body,
                    headers=headers,
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logging.error(f"Claude endpoint error: {e.response.text}")
                raise HTTPException(
                    status_code=e.response.status_code,
                    detail=f"Claude endpoint error: {e.response.text}",
                )
            except Exception as e:
                logging.error(f"Claude proxy error: {e}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Claude proxy error: {e}",
                )

    # No custom Claude endpoint - convert to OpenAI format and use standard proxy
    # Convert Claude messages to OpenAI format (they're mostly compatible)
    openai_messages = []
    for msg in messages:
        openai_msg = {
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        }
        openai_messages.append(openai_msg)

    # Use existing OpenAI-compatible proxy
    result = await proxy_chat_completion(
        db=db,
        container_token=container_token,
        agent_id=agent_id,
        model=model,
        messages=openai_messages,
        max_tokens=max_tokens,
        temperature=temperature,
        tools=tools,
        stream=stream,
    )

    # If streaming, result is a generator - return as-is
    if stream:
        return result

    # Convert OpenAI response back to Claude format
    # This is a simplified conversion - full conversion would map all fields
    claude_response = {
        "id": result.get("id", ""),
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [],
        "stop_reason": result.get("choices", [{}])[0].get("finish_reason"),
        "usage": {
            "input_tokens": result.get("usage", {}).get("prompt_tokens", 0),
            "output_tokens": result.get("usage", {}).get("completion_tokens", 0),
        },
    }

    # Extract text content
    message = result.get("choices", [{}])[0].get("message", {})
    content = message.get("content", "")
    if content:
        claude_response["content"].append({
            "type": "text",
            "text": content,
        })

    # Extract tool calls if present
    tool_calls = message.get("tool_calls") or []
    for tc in tool_calls:
        claude_response["content"].append({
            "type": "tool_use",
            "id": tc.get("id", ""),
            "name": tc.get("function", {}).get("name", ""),
            "input": tc.get("function", {}).get("arguments", {}),
        })

    return claude_response
