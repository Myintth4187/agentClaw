import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Wrap async route handlers to catch errors and forward to Express error handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Convert frameclaw session_id format (e.g. "web:default") to openclaw session key.
 * frameClaw uses "web:<name>" format; openclaw uses "direct:<name>" or just the key.
 *
 * In multi-agent architecture, sessionKey format is: agent:<agentId>:<sessionKey>
 * This routes the session to the correct user's Agent.
 *
 * @param sessionId - The session ID from frameclaw format
 * @param agentId - Optional agent ID to prefix for multi-agent routing
 */
export function toOpenclawSessionKey(sessionId: string, agentId?: string): string {
  // Multi-agent architecture: prefix with agentId if provided
  // Format: agent:<agentId>:<sessionKey>

  // If sessionKey already has agent: prefix, don't add it again
  if (sessionId.startsWith("agent:")) {
    return sessionId;
  }

  if (agentId) {
    return `agent:${agentId}:${sessionId}`;
  }
  // Legacy mode (single agent): pass through as-is
  return sessionId;
}

/**
 * Convert openclaw session key back to frameclaw format.
 */
export function toFrameclawSessionId(openclawKey: string): string {
  return openclawKey;
}

/**
 * Extract text content from openclaw message content array.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: Record<string, unknown>) => block.type === "text")
      .map((block: Record<string, unknown>) => block.text)
      .join("");
  }
  return "";
}

/**
 * Generate a unique file ID (12 hex chars).
 */
export function generateFileId(): string {
  return randomBytes(6).toString("hex");
}

/**
 * Sanitize path to prevent directory traversal.
 */
export function sanitizePath(inputPath: string, basePath: string): string | null {
  // Normalize base path to ensure consistent comparison
  const normalizedBase = path.resolve(basePath);
  const resolved = path.resolve(normalizedBase, inputPath);

  // Ensure resolved path starts with base path + separator (to prevent partial matches)
  // Or is exactly equal to base path
  const separator = path.sep;
  if (
    resolved !== normalizedBase &&
    !resolved.startsWith(normalizedBase + separator)
  ) {
    return null;
  }

  return resolved;
}
