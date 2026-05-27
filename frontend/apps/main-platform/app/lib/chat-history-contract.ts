export type ChatMode = "local" | "global";
export type PersistedMessageRole = "user" | "bot";

export interface ChatMessageItem {
  id: string;
  role: PersistedMessageRole;
  content: string;
  evidenceJson?: string | null;
  createdAt: string;
}

export interface ChatConversationSummary {
  id: string;
  mode: ChatMode;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversationDetail extends ChatConversationSummary {
  messages: ChatMessageItem[];
}

export interface PersistedMessageInput {
  role: PersistedMessageRole;
  content: string;
  evidenceJson?: string | null;
}

export interface CreateConversationInput {
  mode: ChatMode;
  title?: string;
  messages?: PersistedMessageInput[];
}

export interface AppendMessagesInput {
  messages: PersistedMessageInput[];
}

export type ListConversationsResponse = {
  conversations: ChatConversationSummary[];
};

export type GetConversationResponse = {
  conversation: ChatConversationDetail;
};

export type CreateConversationResponse = {
  conversation: ChatConversationSummary;
};
