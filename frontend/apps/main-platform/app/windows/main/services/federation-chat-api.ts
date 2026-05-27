import { buildNodeAuthContext, createNodeAuthHeaders } from "@/app/lib/client/node-auth-headers";

export interface FederationNodeDetail {
  node: string;
  status: string;
  confidence?: number;
  answer_preview?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface FederationAskResult {
  requestId: string;
  status: "ok" | "partial" | "error";
  answer: string;
  details: FederationNodeDetail[];
}

interface FederationErrorPayload {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
}

export class FederationChatError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, options: { code?: string; requestId?: string; status?: number; details?: unknown } = {}) {
    super(message);
    this.name = "FederationChatError";
    this.code = options.code ?? "FEDERATION_CHAT_ERROR";
    this.requestId = options.requestId;
    this.status = options.status;
    this.details = options.details;
  }
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeSuccessPayload(data: unknown): FederationAskResult {
  if (!data || typeof data !== "object") {
    throw new FederationChatError("联邦响应格式无效", { code: "FEDERATION_RESPONSE_INVALID" });
  }

  const payload = data as Partial<FederationAskResult>;
  if (typeof payload.requestId !== "string") {
    throw new FederationChatError("联邦响应缺少 requestId", { code: "FEDERATION_RESPONSE_INVALID" });
  }
  if (payload.status !== "ok" && payload.status !== "partial" && payload.status !== "error") {
    throw new FederationChatError("联邦响应状态字段无效", { code: "FEDERATION_RESPONSE_INVALID" });
  }
  if (typeof payload.answer !== "string") {
    throw new FederationChatError("联邦响应缺少答案字段", { code: "FEDERATION_RESPONSE_INVALID" });
  }
  if (!Array.isArray(payload.details)) {
    throw new FederationChatError("联邦响应缺少节点明细", { code: "FEDERATION_RESPONSE_INVALID" });
  }

  return {
    requestId: payload.requestId,
    status: payload.status,
    answer: payload.answer,
    details: payload.details as FederationNodeDetail[],
  };
}

export async function askFederationChat(
  question: string,
  context: { account: string; isSelfCenterNode: boolean },
): Promise<FederationAskResult> {
  const requestId = createRequestId();
  const authHeaders = createNodeAuthHeaders(buildNodeAuthContext({
    account: context.account,
    isSelfCenterNode: context.isSelfCenterNode,
  }));

  const response = await fetch("/api/federation/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...authHeaders,
    },
    body: JSON.stringify({ question }),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const payload = (data ?? {}) as FederationErrorPayload;
    const message = payload.error?.message ?? "联邦检索失败，请稍后重试";
    throw new FederationChatError(message, {
      code: payload.error?.code ?? "FEDERATION_HTTP_ERROR",
      requestId: payload.error?.requestId ?? requestId,
      status: response.status,
      details: payload.error?.details,
    });
  }

  return normalizeSuccessPayload(data);
}
