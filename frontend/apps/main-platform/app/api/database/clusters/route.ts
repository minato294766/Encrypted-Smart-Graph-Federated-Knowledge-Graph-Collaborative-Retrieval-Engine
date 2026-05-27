import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import { createNodeCluster, listNodeClusters, resolveNodeAccount } from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || "db-clusters-get";
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
    const clusters = await listNodeClusters(ownerAccount);
    return NextResponse.json({ clusters });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}

const CreateClusterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "聚类名称不能为空")
    .max(50, "名称不能超过 50 个字符"),
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().max(32, "节点名称不能超过 32 个字符").optional(),
});

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || "db-clusters-post";
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

  const result = CreateClusterSchema.safeParse(body);
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
    const cluster = await createNodeCluster({
      account: ownerAccount,
      actor: requestActor,
      name: result.data.name,
    });
    return NextResponse.json({ cluster }, { status: 201 });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
