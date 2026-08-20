import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "user"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const chatSessions = mysqlTable(
  "chat_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull().default("New conversation"),
    model: varchar("model", { length: 120 }).notNull().default("gpt-5-mini"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    byUserUpdated: index("chat_sessions_user_updated_idx").on(
      table.userId,
      table.updatedAt
    ),
  })
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 36 })
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    bySessionCreated: index("chat_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt
    ),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
