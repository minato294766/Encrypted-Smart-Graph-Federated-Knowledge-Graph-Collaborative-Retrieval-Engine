import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";

export function toChatHistoryErrorResponse(err: unknown): Response {
  if (err instanceof PrismaClientInitializationError) {
    return Response.json(
      { error: "数据库暂不可用，请检查 DATABASE_URL 与数据库服务" },
      { status: 503 },
    );
  }

  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (err.code === "P2003") {
      return Response.json({ error: "Conversation relation not found" }, { status: 409 });
    }
    return Response.json({ error: "Database request failed" }, { status: 500 });
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  return Response.json({ error: message }, { status: 500 });
}
