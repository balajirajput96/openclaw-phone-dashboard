import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "./_core/env";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import * as db from "./db";
import { chatSendInput, chatSessionIdInput, DEFAULT_CHAT_MODEL, isOwner } from "./chatValidation";

const modelInput = z.string().min(1).max(120);

const ownerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!isOwner(ctx.user.openId, ENV.ownerOpenId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This dashboard is owner-only." });
  }
  return next({ ctx });
});

function toLLMMessages(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  return [
    {
      role: "system" as const,
      content:
        "You are OpenClaw, a concise and thoughtful AI assistant. Use clear Markdown when it improves readability.",
    },
    ...messages.map(message => ({ role: message.role, content: message.content })),
  ];
}

function responseText(response: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = response.choices[0]?.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n");
  }
  return "I couldn't generate a response. Please try again.";
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  chat: router({
    models: ownerProcedure.query(async () => {
      const catalog = await listLLMModels();
      return catalog.data.map(model => ({ id: model.id, owner: model.owned_by }));
    }),
    sessions: ownerProcedure.query(({ ctx }) => db.listChatSessions(ctx.user.id)),
    session: ownerProcedure.input(chatSessionIdInput).query(async ({ ctx, input }) => {
      const session = await db.getChatSessionForUser(ctx.user.id, input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      return { session, messages: await db.getChatMessages(session.id) };
    }),
    createSession: ownerProcedure
      .input(z.object({ model: modelInput.optional(), title: z.string().max(160).optional() }))
      .mutation(({ ctx, input }) =>
        db.createChatSession({
          userId: ctx.user.id,
          model: input.model ?? DEFAULT_CHAT_MODEL,
          title: input.title?.trim() || "New conversation",
        })
      ),
    clearSession: ownerProcedure.input(chatSessionIdInput).mutation(async ({ ctx, input }) => {
      const cleared = await db.clearChatMessages(ctx.user.id, input.sessionId);
      if (!cleared) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      return { success: true } as const;
    }),
    send: ownerProcedure
      .input(chatSendInput)
      .mutation(async ({ ctx, input }) => {
        const session = await db.getChatSessionForUser(ctx.user.id, input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });

        const model = input.model ?? session.model;
        if (model !== session.model) {
          await db.updateChatSessionModel({ userId: ctx.user.id, sessionId: session.id, model });
        }

        await db.appendChatMessage({ sessionId: session.id, role: "user", content: input.content });
        const history = await db.getChatMessages(session.id);
        const completion = await invokeLLM({ model, messages: toLLMMessages(history) });
        const content = responseText(completion);
        const assistant = await db.appendChatMessage({
          sessionId: session.id,
          role: "assistant",
          content,
        });
        return { assistant };
      }),
  }),
});

export type AppRouter = typeof appRouter;
export { ownerProcedure, responseText, toLLMMessages };
