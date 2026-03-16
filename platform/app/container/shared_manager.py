"""Shared OpenClaw instance management - single instance serving all users.

In the multi-agent architecture, all users share a single OpenClaw Gateway instance.
Each user gets an Agent with sandbox isolation (Docker containers per-agent).
"""

from __future__ import annotations

import docker
from docker.errors import NotFound as DockerNotFound

from app.config import settings

_client: docker.DockerClient | None = None


def _docker() -> docker.DockerClient:
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def _ensure_network() -> None:
    """Create the internal Docker network if it doesn't exist."""
    client = _docker()
    try:
        client.networks.get(settings.container_network)
    except DockerNotFound:
        client.networks.create(
            settings.container_network,
            driver="bridge",
            internal=False,  # allow internet access for tool downloads
        )


async def ensure_shared_container() -> dict:
    """Ensure the shared OpenClaw container is running.

    Returns:
        dict with container info including internal_host and internal_port
    """
    client = _docker()
    _ensure_network()
    container_name = "openclaw-shared"

    # Check if container exists and is running
    try:
        container = client.containers.get(container_name)
        if container.status != "running":
            container.start()
        container.reload()
        network_settings = container.attrs["NetworkSettings"]["Networks"]
        internal_ip = network_settings.get(settings.container_network, {}).get(
            "IPAddress", ""
        )
        return {
            "internal_host": internal_ip,
            "internal_port": 18080,
        }
    except DockerNotFound:
        pass

    # Create new shared container
    # Mount Docker socket for sandbox container management
    container = client.containers.run(
        image=settings.openclaw_image,
        command=["node", "dist/start.js"],
        name=container_name,
        detach=True,
        environment={
            "FRAMECLAW_PROXY__URL": "http://gateway:8080/llm/v1",
            "FRAMECLAW_PROXY__TOKEN": "",  # Shared instance uses container token per request
            "FRAMECLAW_AGENTS__DEFAULTS__MODEL": settings.default_model,
            # Sandbox configuration for agent isolation
            "FRAMECLAW_AGENTS__DEFAULTS__SANDBOX__MODE": "all",
            "FRAMECLAW_AGENTS__DEFAULTS__SANDBOX__SCOPE": "agent",
            "FRAMECLAW_AGENTS__DEFAULTS__SANDBOX__PRUNE__IDLEHOURS": "24",
        },
        mounts=[
            docker.types.Mount(
                "/root/.openclaw", "openclaw-shared-data", type="volume"
            ),
            # Docker socket for creating sandbox containers
            docker.types.Mount(
                "/var/run/docker.sock", "/var/run/docker.sock", type="bind"
            ),
        ],
        network=settings.container_network,
        # Shared instance needs more resources
        mem_limit="4g",
        nano_cpus=int(4.0 * 1e9),
        restart_policy={"Name": "unless-stopped"},
    )

    container.reload()
    network_settings = container.attrs["NetworkSettings"]["Networks"]
    internal_ip = network_settings.get(settings.container_network, {}).get(
        "IPAddress", ""
    )

    return {
        "internal_host": internal_ip,
        "internal_port": 18080,
    }


async def get_shared_container_info() -> dict | None:
    """Get info about the shared container if it exists.

    Returns:
        dict with container info or None if container doesn't exist
    """
    client = _docker()
    container_name = "openclaw-shared"

    try:
        container = client.containers.get(container_name)
        container.reload()
        network_settings = container.attrs["NetworkSettings"]["Networks"]
        internal_ip = network_settings.get(settings.container_network, {}).get(
            "IPAddress", ""
        )
        return {
            "internal_host": internal_ip,
            "internal_port": 18080,
            "status": container.status,
        }
    except DockerNotFound:
        return None


async def restart_shared_container() -> bool:
    """Restart the shared container.

    Returns:
        True if container was restarted, False if it didn't exist
    """
    client = _docker()
    container_name = "openclaw-shared"

    try:
        container = client.containers.get(container_name)
        container.restart()
        return True
    except DockerNotFound:
        return False
