import { prisma } from "../prisma";
import {
  ChatMode,
  ChatConversationSummary,
  ChatConversationDetail,
  CreateConversationInput,
  AppendMessagesInput,
} from "@/app/lib/chat-history-contract";
import { MockChatHistory } from "./mock-storage";

const DEFAULT_CONVERSATION_TITLE = "新建对话";

// 存储模式开关
// CHAT_HISTORY_STORAGE_MODE=mock   → 始终使用内存 Mock（离线 / 前端纯演示）
// CHAT_HISTORY_STORAGE_MODE=auto   → 优先 Prisma，失败后自动降级 Mock
// CHAT_HISTORY_STORAGE_MODE=prisma → 强制 Prisma，数据库不可用时直接报错（默认）
type StorageMode = "auto" | "mock" | "prisma";
const STORAGE_MODE: StorageMode =
  (process.env.CHAT_HISTORY_STORAGE_MODE as StorageMode | undefined) ?? "prisma";

// 数据库可用性缓存（仅 auto 模式使用）
let dbAvailable: boolean | null = null;

async function checkDbAvailable(): Promise<boolean> {
  if (STORAGE_MODE === "mock") return false;
  if (STORAGE_MODE === "prisma") return true;
  // auto: 探测并缓存结果
  if (dbAvailable !== null) return dbAvailable;
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
    return true;
  } catch {
    dbAvailable = false;
    console.warn("[chat-history] Database unavailable, falling back to mock mode");
    return false;
  }
}

export function isMockMode(): boolean {
  if (STORAGE_MODE === "mock") return true;
  if (STORAGE_MODE === "prisma") return false;
  return dbAvailable === false;
}

export function getStorageMode(): StorageMode {
  return STORAGE_MODE;
}

export function buildConversationTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 15) return trimmed;
  return trimmed.slice(0, 15) + "...";
}

export async function listAllConversations(ownerAccount: string = "default"): Promise<ChatConversationSummary[]> {
  if (!(await checkDbAvailable())) {
    return MockChatHistory.listAllConversations();
  }
  const rows = await prisma.chatConversation.findMany({
    where: { ownerAccount },
    orderBy: { updatedAt: "desc" },
    select: { id: true, mode: true, title: true, createdAt: true, updatedAt: true },
  });
  return rows.map((r: {
    id: string;
    mode: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    ...r,
    mode: r.mode as ChatMode,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getConversationWithMessages(
  id: string,
): Promise<ChatConversationDetail | null> {
  if (!(await checkDbAvailable())) {
    return MockChatHistory.getConversationWithMessages(id);
  }
  const row = await prisma.chatConversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    mode: row.mode as ChatMode,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map((m: {
      id: string;
      role: string;
      content: string;
      evidenceJson: string | null;
      createdAt: Date;
    }) => ({
      id: m.id,
      role: m.role as "user" | "bot",
      content: m.content,
      evidenceJson: m.evidenceJson ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function createConversation(
  input: CreateConversationInput,
  ownerAccount: string = "default",
): Promise<ChatConversationSummary> {
  if (!(await checkDbAvailable())) {
    return MockChatHistory.createConversation(input);
  }
  const normalizedMessages = input.messages ?? [];
  const userMessages = normalizedMessages.filter((m) => m.role === "user");
  if (normalizedMessages.length > 0 && userMessages.length === 0) {
    throw new Error("Cannot create conversation with no user messages");
  }
  const normalizedTitle = input.title?.trim();
  const title = normalizedTitle
    ? normalizedTitle
    : userMessages[0]
      ? buildConversationTitle(userMessages[0].content)
      : DEFAULT_CONVERSATION_TITLE;
  const row = await prisma.chatConversation.create({
    data: {
      ownerAccount,
      mode: input.mode,
      title,
      messages: normalizedMessages.length > 0
        ? {
          create: normalizedMessages.map((m) => ({
            role: m.role,
            content: m.content,
            evidenceJson: m.evidenceJson ?? null,
          })),
        }
        : undefined,
    },
    select: { id: true, mode: true, title: true, createdAt: true, updatedAt: true },
  });
  return {
    ...row,
    mode: row.mode as ChatMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function appendMessages(
  conversationId: string,
  input: AppendMessagesInput,
): Promise<void> {
  if (!(await checkDbAvailable())) {
    return MockChatHistory.appendMessages(conversationId, input);
  }
  if (input.messages.length === 0) return;

  const firstUserMsg = input.messages.find((m) => m.role === "user");

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.createMany({
      data: input.messages.map((m) => ({
        conversationId,
        role: m.role,
        content: m.content,
        evidenceJson: m.evidenceJson ?? null,
      })),
    });

    let newTitle: string | undefined;
    if (firstUserMsg) {
      const conv = await tx.chatConversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });
      if (conv?.title === DEFAULT_CONVERSATION_TITLE) {
        newTitle = buildConversationTitle(firstUserMsg.content);
      }
    }

    await tx.chatConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        ...(newTitle ? { title: newTitle } : {}),
      },
    });
  });
}

export async function deleteConversation(id: string): Promise<void> {
  if (!(await checkDbAvailable())) {
    return MockChatHistory.deleteConversation(id);
  }
  await prisma.chatConversation.delete({ where: { id } });
}
