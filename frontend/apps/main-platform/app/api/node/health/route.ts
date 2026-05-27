import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import { getNodeMetrics, resolveNodeAccount } from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || randomUUID();
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
    const ownerAccount = resolveNodeAccount({ account: authResult.context.account || rawAccount });
    const metrics = await getNodeMetrics(ownerAccount);
    return NextResponse.json(
      {
        requestId,
        status: "ok",
        account: ownerAccount,
        metrics,
      },
      { status: 200 },
    );
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
