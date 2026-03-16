import { describe, it, expect } from "vitest";
import { toOpenclawSessionKey, toNanobotSessionId } from "./utils.js";

describe("toOpenclawSessionKey", () => {
  it("should return agent-prefixed key when agentId is provided", () => {
    expect(toOpenclawSessionKey("main", "user-123")).toBe("agent:user-123:main");
    expect(toOpenclawSessionKey("web:default", "user-456")).toBe("agent:user-456:web:default");
  });

  it("should return raw key when agentId is not provided", () => {
    expect(toOpenclawSessionKey("main")).toBe("main");
    expect(toOpenclawSessionKey("web:default")).toBe("web:default");
  });

  it("should handle empty agentId", () => {
    expect(toOpenclawSessionKey("main", "")).toBe("main");
  });
});

describe("toNanobotSessionId", () => {
  it("should return the key as-is", () => {
    expect(toNanobotSessionId("main")).toBe("main");
    expect(toNanobotSessionId("agent:user-123:main")).toBe("agent:user-123:main");
  });
});
