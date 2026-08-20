import { z } from "zod";

export const DEFAULT_CHAT_MODEL = "gpt-5-mini";

export const chatSessionIdInput = z.object({
  sessionId: z.string().min(1).max(36),
});

export const chatSendInput = z.object({
  sessionId: z.string().min(1).max(36),
  content: z.string().trim().min(1).max(12_000),
  model: z.string().min(1).max(120).optional(),
});

export const isOwner = (openId: string | undefined, ownerOpenId: string) =>
  Boolean(openId && ownerOpenId && openId === ownerOpenId);

export function conversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "New conversation";
  return normalized.length > 60 ? `${normalized.slice(0, 57)}…` : normalized;
}

export function progressiveChunks(content: string, size = 18) {
  if (!content) return [];
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    let end = Math.min(cursor + size, content.length);
    const nearbyWhitespace = content.lastIndexOf(" ", end);
    if (nearbyWhitespace > cursor + Math.floor(size / 2)) {
      end = nearbyWhitespace + 1;
    }
    chunks.push(content.slice(cursor, end));
    cursor = end;
  }

  return chunks;
}

export function createSessionRecord(input: {
  id: string;
  userId: number;
  title: string;
  model: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    userId: input.userId,
    title: input.title,
    model: input.model,
    createdAt: now,
    updatedAt: now,
  };
}
