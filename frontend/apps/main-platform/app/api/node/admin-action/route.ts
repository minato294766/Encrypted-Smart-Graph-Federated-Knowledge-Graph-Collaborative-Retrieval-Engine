import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import { recordNodeAdminAction, resolveNodeAccount } from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

const NodeAdminActionSchema = z.object({
  requestType: z.string().trim().min(1, "requestType 不能为空"),
  remark: z.string().trim().optional(),
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const authResult = requireNodeAuth(request, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "NODE_BAD_JSON",
          message: "请求体必须为 JSON 格式",
          requestId,
        },
      },
      { status: 400 },
    );
  }

  const parsed = NodeAdminActionSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json(
      {
        error: {
          code: "NODE_BAD_REQUEST",
          message,
          requestId,
        },
      },
      { status: 422 },
    );
  }

  try {
    const ownerCheck = enforceAccountOwnership(authResult.context, parsed.data.account, requestId);
    if (ownerCheck) {
      return ownerCheck;
    }

    const requestAccount = authResult.context.account || parsed.data.account;
    const requestActor = parsed.data.actor ?? authResult.context.actor;
    const ownerAccount = resolveNodeAccount({
      account: requestAccount,
      actor: requestActor,
    });

    const result = await recordNodeAdminAction({
      account: ownerAccount,
      actor: requestActor,
      requestType: parsed.data.requestType,
      remark: parsed.data.remark,
    });

    return NextResponse.json(
      {
        requestId,
        ok: true,
        account: ownerAccount,
        action: result.action,
      },
      { status: 200 },
    );
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
