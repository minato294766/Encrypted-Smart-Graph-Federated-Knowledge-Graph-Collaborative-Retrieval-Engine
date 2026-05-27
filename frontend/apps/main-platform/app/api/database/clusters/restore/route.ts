import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";

export const dynamic = "force-dynamic";

const RestoreSchema = z.object({
  clusterId: z.string().min(1, "聚类ID不能为空"),
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().max(32, "节点名称不能超过 32 个字符").optional(),
});

// POST /api/database/clusters/restore
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || "db-restore-post";
  const authResult = requireNodeAuth(request, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON 格式" }, { status: 400 });
  }

  const result = RestoreSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const ownerCheck = enforceAccountOwnership(authResult.context, result.data.account, requestId);
  if (ownerCheck) {
    return ownerCheck;
  }

  void result.data;
  return NextResponse.json(
    { error: "SQL 模式下不再支持 legacy restore 接口，请改用迁移脚本或管理员导入流程" },
    { status: 410 },
  );
}
