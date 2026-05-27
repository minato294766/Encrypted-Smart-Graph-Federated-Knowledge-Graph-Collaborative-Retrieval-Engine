import { NextRequest, NextResponse } from "next/server";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import { listNodeUpdates } from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || "db-updates-get";
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
    const updates = await listNodeUpdates(ownerAccount);
    return NextResponse.json({ updates });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
