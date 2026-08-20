import { describe, expect, it } from "vitest";
import {
  chatSendInput,
  conversationTitle,
  createSessionRecord,
  isOwner,
  progressiveChunks,
} from "./chatValidation";

describe("chat authorization and progressive display helpers", () => {
  it("permits only the configured owner identifier", () => {
    expect(isOwner("owner-123", "owner-123")).toBe(true);
    expect(isOwner("another-user", "owner-123")).toBe(false);
    expect(isOwner(undefined, "owner-123")).toBe(false);
  });

  it("derives a clean title from a user prompt", () => {
    expect(conversationTitle("  Design   a  mobile chat app ")).toBe("Design a mobile chat app");
    expect(conversationTitle(" ")).toBe("New conversation");
  });

  it("splits assistant content into ordered progressive chunks", () => {
    const input = "A deliberate response should arrive in readable chunks.";
    expect(progressiveChunks(input, 12).join("")).toBe(input);
    expect(progressiveChunks("", 12)).toEqual([]);
  });

  it("validates chat messages before they reach model or persistence code", () => {
    expect(chatSendInput.safeParse({ sessionId: "session-1", content: "Hello" }).success).toBe(true);
    expect(chatSendInput.safeParse({ sessionId: "", content: "Hello" }).success).toBe(false);
    expect(chatSendInput.safeParse({ sessionId: "session-1", content: "   " }).success).toBe(false);
  });

  it("creates user-scoped session records with matching persistence timestamps", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    expect(createSessionRecord({ id: "session-1", userId: 42, title: "Plan", model: "gpt-5-mini", now })).toMatchObject({
      id: "session-1",
      userId: 42,
      title: "Plan",
      model: "gpt-5-mini",
      createdAt: now,
      updatedAt: now,
    });
  });
});
