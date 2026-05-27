import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";

export function toNodeDatabaseErrorResponse(err: unknown): Response {
  if (err instanceof PrismaClientInitializationError) {
    return Response.json(
      { error: "数据库暂不可用，请检查 DATABASE_URL 与数据库服务" },
      { status: 503 },
    );
  }

  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return Response.json({ error: "数据已存在，请勿重复创建" }, { status: 409 });
    }
    if (err.code === "P2025") {
      return Response.json({ error: "目标数据不存在" }, { status: 404 });
    }
    return Response.json({ error: "数据库请求失败" }, { status: 500 });
  }

  const message = err instanceof Error ? err.message : "未知错误";
  return Response.json({ error: message }, { status: 500 });
}
