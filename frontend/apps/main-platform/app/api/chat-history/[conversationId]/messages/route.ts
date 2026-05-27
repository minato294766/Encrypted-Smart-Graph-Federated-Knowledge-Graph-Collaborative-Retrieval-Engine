export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { appendMessages, isMockMode } from "@/app/lib/server/chat-history";
import { toChatHistoryErrorResponse } from "../../error-response";

const AppendMessagesSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "bot"]),
        content: z.string().min(1),
        evidenceJson: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

type RouteParams = { params: Promise<{ conversationId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    const body: unknown = await req.json();
    const parsed = AppendMessagesSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await appendMessages(conversationId, parsed.data);
    return Response.json({ ok: true, mock: isMockMode() });
  } catch (err) {
    return toChatHistoryErrorResponse(err);
  }
}
