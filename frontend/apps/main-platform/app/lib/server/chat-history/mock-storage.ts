// Mock 存储（服务端纯内存）- 当数据库不可用时自动降级使用
// 注意：数据存储于 Node.js 进程内存中，服务器重启后数据丢失。
// 这是 UI_PREVIEW 阶段的预期行为；生产阶段应使用 Prisma 持久化。

import {
  ChatConversationSummary,
  ChatConversationDetail,
  CreateConversationInput,
  AppendMessagesInput,
  ChatMessageItem,
} from "@/app/lib/chat-history-contract";

interface MockConversation {
  id: string;
  mode: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MockMessage[];
}

interface MockMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  evidenceJson: string | null;
  createdAt: string;
}

const conversations = new Map<string, MockConversation>();
let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `mock-${Date.now()}-${idCounter}`;
}

export const MockChatHistory = {
  async listAllConversations(): Promise<ChatConversationSummary[]> {
    const rows = Array.from(conversations.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return rows.map((r) => ({
      id: r.id,
      mode: r.mode as "local" | "global",
      title: r.title,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },

  async getConversationWithMessages(
    id: string
  ): Promise<ChatConversationDetail | null> {
    const row = conversations.get(id);
    if (!row) return null;
    return {
      id: row.id,
      mode: row.mode as "local" | "global",
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messages: row.messages.map(
        (m): ChatMessageItem => ({
          id: m.id,
          role: m.role as "user" | "bot",
          content: m.content,
          evidenceJson: m.evidenceJson ?? null,
          createdAt: m.createdAt,
        })
      ),
    };
  },

  async createConversation(
    input: CreateConversationInput
  ): Promise<ChatConversationSummary> {
    const normalizedMessages = input.messages ?? [];
    const userMessages = normalizedMessages.filter((m) => m.role === "user");

    if (normalizedMessages.length > 0 && userMessages.length === 0) {
      throw new Error("Cannot create conversation with no user messages");
    }

    const normalizedTitle = input.title?.trim();
    const title = normalizedTitle
      ? normalizedTitle
      : userMessages[0]
        ? userMessages[0].content.slice(0, 15) +
          (userMessages[0].content.length > 15 ? "..." : "")
        : "新建对话";

    const now = new Date().toISOString();
    const conversation: MockConversation = {
      id: generateId(),
      mode: input.mode,
      title,
      createdAt: now,
      updatedAt: now,
      messages: normalizedMessages.map(
        (m, index): MockMessage => ({
          id: generateId(),
          conversationId: "",
          role: m.role,
          content: m.content,
          evidenceJson: m.evidenceJson ?? null,
          createdAt: new Date(Date.now() + index).toISOString(),
        })
      ),
    };

    conversation.messages.forEach((m) => {
      m.conversationId = conversation.id;
    });

    conversations.set(conversation.id, conversation);

    return {
      id: conversation.id,
      mode: conversation.mode as "local" | "global",
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  },

  async appendMessages(
    conversationId: string,
    input: AppendMessagesInput
  ): Promise<void> {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    if (input.messages.length === 0) return;

    const now = new Date().toISOString();
    const newMessages: MockMessage[] = input.messages.map((m, index) => ({
      id: generateId(),
      conversationId,
      role: m.role,
      content: m.content,
      evidenceJson: m.evidenceJson ?? null,
      createdAt: new Date(Date.now() + index).toISOString(),
    }));

    conversation.messages.push(...newMessages);
    conversation.updatedAt = now;

    if (conversation.title === "新建对话") {
      const firstUserMsg = input.messages.find((m) => m.role === "user");
      if (firstUserMsg) {
        const trimmed = firstUserMsg.content.trim().replace(/\s+/g, " ");
        conversation.title = trimmed.length <= 15 ? trimmed : trimmed.slice(0, 15) + "...";
      }
    }
  },

  async deleteConversation(id: string): Promise<void> {
    conversations.delete(id);
  },

  isMockMode(): boolean {
    return true;
  },

  clear(): void {
    conversations.clear();
    idCounter = 0;
  },
};
