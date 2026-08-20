import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(openId: string): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId,
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("owner-only chat router", () => {
  it("rejects a signed-in non-owner before querying conversations", async () => {
    const caller = appRouter.createCaller(contextFor("not-the-owner"));
    await expect(caller.chat.sessions()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
