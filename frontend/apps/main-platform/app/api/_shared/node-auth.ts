import { NextRequest, NextResponse } from "next/server";
import {
  NODE_AUTH_HEADERS,
  normalizeNodeRole,
  type NodeAuthContext,
} from "@/app/lib/node-auth-contract";

const NODE_AUTH_STRICT_MODE = (() => {
  if (process.env.NODE_AUTH_STRICT_MODE !== "false") {
    return true;
  }

  const allowBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_AUTH_ALLOW_INSECURE_BYPASS === "true";

  return !allowBypass;
})();

function createAuthErrorResponse(requestId: string, status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId,
      },
    },
    { status },
  );
}

function safeDecodeHeader(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseNodeAuthContext(request: NextRequest): NodeAuthContext | null {
  const rawAccount = safeDecodeHeader(request.headers.get(NODE_AUTH_HEADERS.account)?.trim() ?? "");
  const rawRole = request.headers.get(NODE_AUTH_HEADERS.role)?.trim() ?? "";
  if (!rawAccount || !rawRole) return null;

  const role = normalizeNodeRole(rawRole);
  if (!role) return null;

  const rawActor = safeDecodeHeader(request.headers.get(NODE_AUTH_HEADERS.actor)?.trim() ?? "");
  return {
    account: rawAccount,
    role,
    actor: rawActor || undefined,
  };
}

export function requireNodeAuth(
  request: NextRequest,
  requestId: string,
): { ok: true; context: NodeAuthContext } | { ok: false; response: NextResponse } {
  const context = parseNodeAuthContext(request);
  if (!context) {
    if (!NODE_AUTH_STRICT_MODE) {
      return {
        ok: true,
        context: {
          account: "",
          role: "normal",
        },
      };
    }
    return {
      ok: false,
      response: createAuthErrorResponse(requestId, 401, "NODE_AUTH_REQUIRED", "缺少或无效的节点认证头"),
    };
  }

  return { ok: true, context };
}

export function requireRole(
  context: NodeAuthContext,
  requestId: string,
  expectedRole: NodeAuthContext["role"],
): NextResponse | null {
  if (!NODE_AUTH_STRICT_MODE) return null;
  if (context.role === expectedRole) return null;
  return createAuthErrorResponse(requestId, 403, "NODE_AUTH_FORBIDDEN", `当前角色无权执行该操作，要求角色: ${expectedRole}`);
}

export function enforceAccountOwnership(
  context: NodeAuthContext,
  expectedAccount: string,
  requestId: string,
): NextResponse | null {
  const account = expectedAccount.trim();
  if (!account) {
    return createAuthErrorResponse(requestId, 422, "NODE_ACCOUNT_REQUIRED", "缺少 account 参数");
  }

  if (!NODE_AUTH_STRICT_MODE) return null;

  if (!context.account) {
    return createAuthErrorResponse(requestId, 401, "NODE_AUTH_REQUIRED", "缺少节点账号身份");
  }

  if (context.account === account) return null;

  return createAuthErrorResponse(requestId, 403, "NODE_ACCOUNT_FORBIDDEN", "禁止访问其他账号的数据");
}
