import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import { deleteNodeCluster, resolveNodeAccount } from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

const DeleteClusterSchema = z.object({
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().max(32, "节点名称不能超过 32 个字符").optional(),
});

// DELETE /api/database/clusters/[clusterId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
) {
  const { clusterId } = await params;
  const requestId = request.headers.get("x-request-id") || "db-cluster-delete";
  const authResult = requireNodeAuth(request, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown = {};
  try {
    const raw = await request.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as unknown;
    }
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON 格式" }, { status: 400 });
  }

  const result = DeleteClusterSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const ownerCheck = enforceAccountOwnership(authResult.context, result.data.account, requestId);
    if (ownerCheck) {
      return ownerCheck;
    }

    const requestAccount = authResult.context.account || result.data.account;
    const requestActor = result.data.actor ?? authResult.context.actor;
    const ownerAccount = resolveNodeAccount({
      account: requestAccount,
      actor: requestActor,
    });
    const deleted = await deleteNodeCluster({
      account: ownerAccount,
      actor: requestActor,
      clusterId,
    });
    if (!deleted) {
      return NextResponse.json({ error: "聚类不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
