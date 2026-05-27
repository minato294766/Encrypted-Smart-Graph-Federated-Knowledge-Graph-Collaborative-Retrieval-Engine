import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import type {
  DeleteClusterFileRequest,
  DeleteClusterFileResponse,
  GetClusterFileResponse,
} from "@/app/lib/cluster-files-contract";
import {
  deleteNodeClusterFile,
  getNodeClusterFile,
  resolveNodeAccount,
} from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

const DeleteFileSchema = z.object({
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().max(32, "节点名称不能超过 32 个字符").optional(),
});

// GET /api/database/clusters/[clusterId]/files/[fileId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clusterId: string; fileId: string }> },
) {
  const { clusterId, fileId } = await params;
  const requestId = request.headers.get("x-request-id") || "db-cluster-file-get";
  const authResult = requireNodeAuth(request, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  const rawAccount = request.nextUrl.searchParams.get("account")?.trim() ?? "";
  const ownerCheck = enforceAccountOwnership(authResult.context, rawAccount, requestId);
  if (ownerCheck) {
    return ownerCheck;
  }

  try {
    const ownerAccount = authResult.context.account || rawAccount;
    const file = await getNodeClusterFile({
      account: ownerAccount,
      clusterId,
      fileId,
    });
    if (!file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    return NextResponse.json<GetClusterFileResponse>({ file });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}

// DELETE /api/database/clusters/[clusterId]/files/[fileId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clusterId: string; fileId: string }> },
) {
  const { clusterId, fileId } = await params;
  const requestId = request.headers.get("x-request-id") || "db-cluster-file-delete";
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

  const result = DeleteFileSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const payload: DeleteClusterFileRequest = result.data;

  try {
    const ownerCheck = enforceAccountOwnership(authResult.context, payload.account, requestId);
    if (ownerCheck) {
      return ownerCheck;
    }

    const requestAccount = authResult.context.account || payload.account;
    const requestActor = payload.actor ?? authResult.context.actor;
    const ownerAccount = resolveNodeAccount({
      account: requestAccount,
      actor: requestActor,
    });
    const deleted = await deleteNodeClusterFile({
      account: ownerAccount,
      clusterId,
      fileId,
      actor: requestActor,
    });
    if (!deleted) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    return NextResponse.json<DeleteClusterFileResponse>({ ok: true });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
