import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { z } from "zod";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter, responseText, toLLMMessages } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { invokeLLMStream } from "./llm";
import * as db from "../db";
import { chatSendInput, isOwner } from "../chatValidation";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const writeEvent = (res: express.Response, payload: Record<string, unknown>) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

function registerProgressiveChatEndpoint(app: express.Express) {
  app.post("/api/chat/stream", async (req, res) => {
    let streamStarted = false;
    let finished = false;
    const controller = new AbortController();
    res.on("close", () => {
      if (!finished) controller.abort();
    });

    try {
      const user = await sdk.authenticateRequest(req);
      if (!isOwner(user.openId, ENV.ownerOpenId)) {
        return res.status(403).json({ error: "This dashboard is owner-only." });
      }

      const input = chatSendInput.parse(req.body);
      const session = await db.getChatSessionForUser(user.id, input.sessionId);
      if (!session) return res.status(404).json({ error: "Conversation not found." });

      const model = input.model ?? session.model;
      if (model !== session.model) {
        await db.updateChatSessionModel({ userId: user.id, sessionId: session.id, model });
      }
      await db.appendChatMessage({ sessionId: session.id, role: "user", content: input.content });
      const history = await db.getChatMessages(session.id);

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      streamStarted = true;
      writeEvent(res, { type: "status", value: "thinking" });

      let content = "";
      content = await invokeLLMStream(
        { model, messages: toLLMMessages(history) },
        delta => {
          if (!finished) writeEvent(res, { type: "delta", value: delta });
        },
        controller.signal
      );
      const assistant = await db.appendChatMessage({
        sessionId: session.id,
        role: "assistant",
        content,
      });

      if (!finished) {
        writeEvent(res, { type: "done", message: assistant });
        finished = true;
        res.end();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate a response.";
      if (!streamStarted) return res.status(400).json({ error: message });
      if (!finished) {
        if (controller.signal.aborted) return;
        writeEvent(res, { type: "error", value: message });
        finished = true;
        res.end();
      }
    }
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerProgressiveChatEndpoint(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
