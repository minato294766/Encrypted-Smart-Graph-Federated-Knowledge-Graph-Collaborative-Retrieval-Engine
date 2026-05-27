export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  listAllConversations,
  createConversation,
  isMockMode,
} from "@/app/lib/server/chat-history";
import { toChatHistoryErrorResponse } from "./error-response";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "bot"]),
  content: z.string().min(1),
  evidenceJson: z.string().nullable().optional(),
});

const CreateConversationSchema = z.object({
  mode: z.enum(["local", "global"]),
  title: z.string().trim().min(1).max(60).optional(),
  messages: z.array(ChatMessageSchema).default([]),
  account: z.string().optional(),
}).superRefine((payload, ctx) => {
  if (payload.messages.length > 0 && !payload.messages.some((m) => m.role === "user")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: "Conversation messages must include at least one user message",
    });
  }
});

export async function GET(request: NextRequest) {
  try {
    const account = request.nextUrl.searchParams.get("account") || "default";
    const conversations = await listAllConversations(account);
    return Response.json({ conversations, mock: isMockMode() });
  } catch (err) {
    return toChatHistoryErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const parsed = CreateConversationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const account = parsed.data.account || "default";
    const conversation = await createConversation(parsed.data, account);
    return Response.json({ conversation, mock: isMockMode() }, { status: 201 });
  } catch (err) {
    return toChatHistoryErrorResponse(err);
  }
}
