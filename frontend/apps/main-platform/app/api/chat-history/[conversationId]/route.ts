export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  getConversationWithMessages,
  deleteConversation,
  isMockMode,
} from "@/app/lib/server/chat-history";
import { toChatHistoryErrorResponse } from "../error-response";

type RouteParams = { params: Promise<{ conversationId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    const conversation = await getConversationWithMessages(conversationId);
    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    return Response.json({ conversation, mock: isMockMode() });
  } catch (err) {
    return toChatHistoryErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    await deleteConversation(conversationId);
    return Response.json({ ok: true, mock: isMockMode() });
  } catch (err) {
    return toChatHistoryErrorResponse(err);
  }
}
