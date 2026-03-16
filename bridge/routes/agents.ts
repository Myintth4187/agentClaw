import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import mime from "mime-types";
import type { BridgeConfig } from "../config.js";
import type { BridgeGatewayClient } from "../gateway-client.js";
import { asyncHandler, sanitizePath } from "../utils.js";

/**
 * Fetch user info from platform gateway
 */
async function fetchUserInfo(
  baseUrl: string,
  token: string,
  userId: string,
): Promise<{ id: string; username: string; email?: string } | null> {
  try {
    const resp = await fetch(`${baseUrl}/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Fetch all users from platform gateway
 */
async function fetchAllUsers(
  baseUrl: string,
  token: string,
): Promise<Array<{ id: string; username: string; email?: string }>> {
  try {
    const resp = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.users || [];
  } catch {
    return [];
  }
}

/**
 * Get the root directory for a specific agent.
 * main agent uses ~/.openclaw/workspace, others use ~/.openclaw/workspace-{agentId}
 */
function getAgentRootDir(baseDir: string, agentId: string | undefined): string {
  if (!agentId || agentId === "main") {
    return path.join(baseDir, "workspace");
  }
  return path.join(baseDir, `workspace-${agentId}`);
}

export function agentsRoutes(client: BridgeGatewayClient, config: BridgeConfig): Router {
  const router = Router();

  // GET /api/agents — list agents (filtered by user in multi-agent mode)
  router.get("/agents", asyncHandler(async (req, res) => {
    const agentId = req.headers["x-agent-id"] as string | undefined;
    const isAdmin = req.headers["x-is-admin"] === "true";
    const authHeader = req.headers["authorization"] as string | undefined;

    try {
      const result = await client.request<{ agents: Array<{ id: string; name?: string; identity?: { name?: string } }> }>("agents.list", {});

      // In multi-agent mode:
      // - Regular users only see their own agent
      // - Admins see their own agent + main + system agents (skill-reviewer)
      let agents = result?.agents || [];
      if (!isAdmin) {
        // Non-admin: only see their own agent
        agents = agents.filter((a) => a.id === agentId);
      } else {
        // Admin: see own agent + main + system agents
        // System agents that should be visible to admin
        const systemAgents = ["main", "skill-reviewer"];
        agents = agents.filter((a) => a.id === agentId || systemAgents.includes(a.id));
      }

      // Enrich agents with display names for admin
      if (isAdmin && authHeader && config.proxyUrl) {
        const gatewayUrl = config.proxyUrl.replace("/llm/v1", "");
        const token = authHeader.replace("Bearer ", "");
        const users = await fetchAllUsers(gatewayUrl, token);
        const userMap = new Map(users.map((u) => [u.id, u]));

        agents = agents.map((agent) => {
          const user = userMap.get(agent.id);
          const displayName = user
            ? `${user.username} (${agent.id.slice(0, 8)})`
            : agent.identity?.name || agent.name || agent.id;
          return {
            ...agent,
            displayName,
            username: user?.username,
          };
        });
      }

      // Return in format expected by frontend: { agents: [...] }
      res.json({ agents });
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // POST /api/agents — create agent (admin only)
  router.post("/agents", asyncHandler(async (req, res) => {
    const isAdmin = req.headers["x-is-admin"] === "true";

    // Only admins can create new agents
    if (!isAdmin) {
      res.status(403).json({ detail: "Admin access required" });
      return;
    }

    const { name, workspace, emoji, avatar, installed_skills, model, agentId } = req.body;

    // If agentId is provided, use it as the name (for user-agent mapping)
    const actualName = agentId || name;

    try {
      const defaultWorkspace = path.join(config.openclawHome, `workspace-${actualName}`);
      const actualWorkspace = workspace || defaultWorkspace;
      const resolvedWorkspace = actualWorkspace.startsWith("~")
        ? actualWorkspace.replace("~", os.homedir())
        : actualWorkspace;
      const params: Record<string, unknown> = { name: actualName, workspace: actualWorkspace };
      if (emoji !== undefined) params.emoji = emoji;
      if (avatar !== undefined) params.avatar = avatar;
      if (model !== undefined) params.model = model;

      const result = await client.request<Record<string, unknown>>("agents.create", params);

      // Create workspace directory if it doesn't exist
      try {
        fs.mkdirSync(resolvedWorkspace, { recursive: true });
      } catch (err) {
        console.error("Failed to create workspace directory:", err);
      }

      // Create skills directory by default
      try {
        const agentSkillsDir = path.join(resolvedWorkspace, "skills");
        fs.mkdirSync(agentSkillsDir, { recursive: true });
      } catch (err) {
        console.error("Failed to create skills directory:", err);
      }

      // Install selected curated skills to agent's专属 directory
      if (installed_skills && Array.isArray(installed_skills) && installed_skills.length > 0) {
        // Fetch curated skills from platform to get skill names by ID
        try {
          const gatewayUrl = config.proxyUrl.replace("/llm/v1", "");
          const resp = await fetch(`${gatewayUrl}/api/skills/curated`, {
            headers: { "Authorization": `Bearer ${config.proxyToken}` },
          });
          if (resp.ok) {
            const curatedList: Array<{ id: string; name: string }> = await resp.json();
            const skillIdToName = new Map(curatedList.map(s => [s.id, s.name]));

            const agentSkillsDir = path.join(resolvedWorkspace, "skills");
            fs.mkdirSync(agentSkillsDir, { recursive: true });

            // Curated skills are stored in a Docker volume mounted at /app/curated-skills
            const curatedSkillsBase = "/app/curated-skills";

            for (const skillId of installed_skills) {
              const skillName = skillIdToName.get(skillId);
              if (!skillName) continue;

              const srcDir = path.join(curatedSkillsBase, skillName);
              if (fs.existsSync(srcDir)) {
                const destDir = path.join(agentSkillsDir, skillName);
                fs.cpSync(srcDir, destDir, { recursive: true });
              }
            }
          }
        } catch (err) {
          console.error("Failed to install curated skills:", err);
          // Continue even if skill installation fails - agent is still created
        }
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // PUT /api/agents/:agentId — update agent
  router.put("/agents/:agentId", asyncHandler(async (req, res) => {
    const { name, workspace, model, avatar } = req.body;

    try {
      const params: Record<string, unknown> = { agentId: req.params.agentId };
      if (name !== undefined) params.name = name;
      if (workspace !== undefined) params.workspace = workspace;
      if (model !== undefined) params.model = model;
      if (avatar !== undefined) params.avatar = avatar;

      const result = await client.request<Record<string, unknown>>("agents.update", params);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "Agent not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  // DELETE /api/agents/:agentId — delete agent
  router.delete("/agents/:agentId", asyncHandler(async (req, res) => {
    const agentId = req.params.agentId;
    const deleteFiles = req.query.delete_files === "true";

    // Protect system agents from deletion
    const systemAgents = ["main", "skill-reviewer"];
    if (systemAgents.includes(agentId)) {
      res.status(403).json({ detail: "System agent cannot be deleted" });
      return;
    }

    try {
      await client.request("agents.delete", {
        agentId,
        deleteFiles,
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "Agent not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  // GET /api/agents/:agentId/files — list agent files (read from filesystem)
  router.get("/agents/:agentId/files", asyncHandler(async (req, res) => {
    const requestAgentId = req.headers["x-agent-id"] as string | undefined;
    const isAdmin = req.headers["x-is-admin"] === "true";
    const targetAgentId = req.params.agentId;

    // Access control: user can only access their own agent's files
    // Admin can access any agent's files
    if (!isAdmin && targetAgentId !== requestAgentId) {
      res.status(403).json({ detail: "Access denied" });
      return;
    }

    const baseDir = config.openclawHome;
    const rootDir = getAgentRootDir(baseDir, targetAgentId);

    // If workspace doesn't exist, return empty array (not an error)
    // Some system agents like skill-reviewer may not have a workspace
    if (!fs.existsSync(rootDir)) {
      res.json([]);
      return;
    }

    try {
      // Recursively list files, similar to agents.files.list format
      const files: Array<{
        name: string;
        path: string;
        type: "file" | "directory";
        size?: number;
        modified?: string;
      }> = [];

      function walkDir(dir: string, relPath: string = "") {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip hidden files and special directories
          if (entry.name.startsWith(".")) continue;

          const itemPath = path.join(dir, entry.name);
          const itemRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            files.push({
              name: entry.name,
              path: itemRelPath,
              type: "directory",
            });
            walkDir(itemPath, itemRelPath);
          } else if (entry.isFile()) {
            const stat = fs.statSync(itemPath);
            files.push({
              name: entry.name,
              path: itemRelPath,
              type: "file",
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
          }
        }
      }

      walkDir(rootDir);
      res.json(files);
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // GET /api/agents/:agentId/files/:name — get agent file
  router.get("/agents/:agentId/files/:name", asyncHandler(async (req, res) => {
    const requestAgentId = req.headers["x-agent-id"] as string | undefined;
    const isAdmin = req.headers["x-is-admin"] === "true";
    const targetAgentId = req.params.agentId;

    // Access control
    if (!isAdmin && targetAgentId !== requestAgentId) {
      res.status(403).json({ detail: "Access denied" });
      return;
    }

    const baseDir = config.openclawHome;
    const rootDir = getAgentRootDir(baseDir, targetAgentId);
    const relPath = req.params.name;
    const absPath = sanitizePath(relPath, rootDir);

    if (!absPath || !fs.existsSync(absPath)) {
      res.status(404).json({ detail: "File not found" });
      return;
    }

    try {
      const stat = fs.statSync(absPath);
      if (!stat.isFile()) {
        res.status(400).json({ detail: "Not a file" });
        return;
      }

      // Check file size limit (200KB for text files)
      const contentType = mime.lookup(absPath) || "application/octet-stream";
      const isText = contentType.startsWith("text/") ||
        contentType === "application/json" ||
        contentType === "application/xml" ||
        absPath.endsWith(".md") ||
        absPath.endsWith(".yml") ||
        absPath.endsWith(".yaml") ||
        absPath.endsWith(".toml") ||
        absPath.endsWith(".jsonl");

      if (isText && stat.size <= 200 * 1024) {
        const content = fs.readFileSync(absPath, "utf-8");
        res.json({
          name: path.basename(absPath),
          path: relPath,
          content,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      } else {
        res.json({
          name: path.basename(absPath),
          path: relPath,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          content: null, // Binary or too large
        });
      }
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // PUT /api/agents/:agentId/files/:name — set agent file
  router.put("/agents/:agentId/files/:name", asyncHandler(async (req, res) => {
    const requestAgentId = req.headers["x-agent-id"] as string | undefined;
    const isAdmin = req.headers["x-is-admin"] === "true";
    const targetAgentId = req.params.agentId;

    // Access control
    if (!isAdmin && targetAgentId !== requestAgentId) {
      res.status(403).json({ detail: "Access denied" });
      return;
    }

    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ detail: "Content must be a string" });
      return;
    }

    const baseDir = config.openclawHome;
    const rootDir = getAgentRootDir(baseDir, targetAgentId);
    const relPath = req.params.name;
    const absPath = sanitizePath(relPath, rootDir);

    if (!absPath) {
      res.status(400).json({ detail: "Invalid path" });
      return;
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(absPath);
      fs.mkdirSync(parentDir, { recursive: true });

      // Write file to workspace
      fs.writeFileSync(absPath, content, "utf-8");
      const stat = fs.statSync(absPath);

      // Special handling for SOUL.md: also write to agent config directory
      // OpenClaw reads SOUL.md from ~/.openclaw/agents/<agentId>/SOUL.md
      if (relPath === "SOUL.md") {
        const agentConfigDir = path.join(baseDir, "agents", targetAgentId);
        fs.mkdirSync(agentConfigDir, { recursive: true });
        const agentSoulPath = path.join(agentConfigDir, "SOUL.md");
        fs.writeFileSync(agentSoulPath, content, "utf-8");
      }

      res.json({
        name: path.basename(absPath),
        path: relPath,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // GET /api/models — list available models from gateway + configured model
  router.get("/models", asyncHandler(async (_req, res) => {
    try {
      // Get models from gateway RPC
      const result = await client.request<{ models: Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }> }>(
        "models.list",
        {},
      );

      // Read openclaw.json to find the configured/default model
      const openclawHome = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
      const configPath = path.join(openclawHome, "openclaw.json");
      let configuredModel = "";
      let configuredProviders: Record<string, unknown> = {};

      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          configuredModel = cfg?.agents?.defaults?.model || "";
          configuredProviders = cfg?.models?.providers || {};
        } catch { /* ignore parse errors */ }
      }

      res.json({
        models: result?.models || [],
        configuredModel,
        configuredProviders,
      });
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // PUT /api/models/config — update models config in openclaw.json
  router.put("/models/config", asyncHandler(async (req, res) => {
    const { providers, defaultModel } = req.body;

    const openclawHome = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
    const configPath = path.join(openclawHome, "openclaw.json");

    let cfg: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch { /* start fresh */ }
    }

    // Update providers if provided
    if (providers !== undefined) {
      if (!cfg.models || typeof cfg.models !== "object") {
        cfg.models = { mode: "replace", providers: {} };
      }
      (cfg.models as Record<string, unknown>).providers = providers;
    }

    // Update default model if provided
    if (defaultModel !== undefined) {
      if (!cfg.agents || typeof cfg.agents !== "object") {
        cfg.agents = { defaults: {} };
      }
      const agents = cfg.agents as Record<string, unknown>;
      if (!agents.defaults || typeof agents.defaults !== "object") {
        agents.defaults = {};
      }
      (agents.defaults as Record<string, unknown>).model = defaultModel;
    }

    fs.mkdirSync(openclawHome, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
    res.json({ ok: true });
  }));

  return router;
}
