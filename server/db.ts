import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  chatMessages,
  chatSessions,
  ChatMessage,
  ChatSession,
  InsertUser,
  users,
} from "../drizzle/schema";
import { createSessionRecord } from "./chatValidation";

let dbClient: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!dbClient && process.env.DATABASE_URL) {
    dbClient = drizzle(process.env.DATABASE_URL);
  }
  return dbClient;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (Object.keys(updateSet).length === 0) {
    updateSet.lastSignedIn = new Date();
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listChatSessions(userId: number): Promise<ChatSession[]> {
  const db = await requireDb();
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt));
}

export async function getChatSessionForUser(userId: number, sessionId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function createChatSession(input: {
  userId: number;
  title: string;
  model: string;
}): Promise<ChatSession> {
  const db = await requireDb();
  const session = createSessionRecord({
    id: nanoid(),
    userId: input.userId,
    title: input.title,
    model: input.model,
  }) as ChatSession;
  await db.insert(chatSessions).values(session);
  return session;
}

export async function updateChatSessionModel(input: {
  userId: number;
  sessionId: string;
  model: string;
}) {
  const db = await requireDb();
  await db
    .update(chatSessions)
    .set({ model: input.model, updatedAt: new Date() })
    .where(and(eq(chatSessions.id, input.sessionId), eq(chatSessions.userId, input.userId)));
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await requireDb();
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));
}

export async function appendChatMessage(input: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<ChatMessage> {
  const db = await requireDb();
  const message: ChatMessage = {
    id: nanoid(),
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    createdAt: new Date(),
  };
  await db.insert(chatMessages).values(message);
  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, input.sessionId));
  return message;
}

export async function clearChatMessages(userId: number, sessionId: string) {
  const db = await requireDb();
  const session = await getChatSessionForUser(userId, sessionId);
  if (!session) return false;
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  await db
    .update(chatSessions)
    .set({ title: "New conversation", updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));
  return true;
}
