import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireNodeAuth, requireRole } from "@/app/api/_shared/node-auth";
import { FederationAskRequestSchema } from "@/app/lib/server/federation/schemas";
import { askCentral } from "@/app/lib/server/federation/central-client";
import { toFederationErrorResponse } from "@/app/lib/server/federation/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const authResult = requireNodeAuth(request, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  const roleCheck = requireRole(authResult.context, requestId, "central");
  if (roleCheck) {
    return roleCheck;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "FEDERATION_BAD_JSON",
            message: "请求体必须为 JSON 格式",
            requestId,
          },
        },
        { status: 400 },
      );
    }

    const parsed = FederationAskRequestSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "参数错误";
      return NextResponse.json(
        {
          error: {
            code: "FEDERATION_BAD_REQUEST",
            message,
            requestId,
          },
        },
        { status: 422 },
      );
    }

    const result = await askCentral(parsed.data.question, requestId);

    console.info("[federation.ask]", {
      requestId,
      account: authResult.context.account,
      status: result.status,
      detailsCount: result.details.length,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const normalized = toFederationErrorResponse(error, requestId);
    console.error("[federation.ask.error]", {
      requestId,
      status: normalized.status,
      code: normalized.body.error.code,
      message: normalized.body.error.message,
    });
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
