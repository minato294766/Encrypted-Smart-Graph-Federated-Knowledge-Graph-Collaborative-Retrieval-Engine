import type {
  NodeApiErrorBody,
  NodeRetrieveResponse,
} from "@/app/lib/node-retrieve-contract";
import { buildNodeAuthContext, createNodeAuthHeaders } from "@/app/lib/client/node-auth-headers";

export class NodeRetrieveError extends Error {
  readonly code: string;
  readonly requestId?: string;
  readonly status?: number;

  constructor(message: string, options: { code?: string; requestId?: string; status?: number } = {}) {
    super(message);
    this.name = "NodeRetrieveError";
    this.code = options.code ?? "NODE_RETRIEVE_ERROR";
    this.requestId = options.requestId;
    this.status = options.status;
  }
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeSuccessPayload(data: unknown): NodeRetrieveResponse {
  if (!data || typeof data !== "object") {
    throw new NodeRetrieveError("节点响应格式无效", { code: "NODE_RESPONSE_INVALID" });
  }

  const payload = data as Partial<NodeRetrieveResponse>;
  if (typeof payload.requestId !== "string") {
    throw new NodeRetrieveError("节点响应缺少 requestId", { code: "NODE_RESPONSE_INVALID" });
  }
  if (payload.status !== "ok" && payload.status !== "error") {
    throw new NodeRetrieveError("节点响应状态字段无效", { code: "NODE_RESPONSE_INVALID" });
  }
  if (typeof payload.answer !== "string") {
    throw new NodeRetrieveError("节点响应缺少答案字段", { code: "NODE_RESPONSE_INVALID" });
  }
  if (!Array.isArray(payload.details)) {
    throw new NodeRetrieveError("节点响应缺少检索明细", { code: "NODE_RESPONSE_INVALID" });
  }

  return {
    requestId: payload.requestId,
    status: payload.status,
    answer: payload.answer,
    details: payload.details,
  };
}

export async function askNodeRetrieve(
  question: string,
  account: string,
  isSelfCenterNode: boolean,
): Promise<NodeRetrieveResponse> {
  const requestId = createRequestId();
  const authHeaders = createNodeAuthHeaders(buildNodeAuthContext({
    account,
    isSelfCenterNode,
  }));

  const response = await fetch("/api/node/retrieve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...authHeaders,
    },
    body: JSON.stringify({ question, account }),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const payload = (data ?? {}) as Partial<NodeApiErrorBody>;
    const message = payload.error?.message ?? "本地节点检索失败，请稍后重试";
    throw new NodeRetrieveError(message, {
      code: payload.error?.code ?? "NODE_HTTP_ERROR",
      requestId: payload.error?.requestId ?? requestId,
      status: response.status,
    });
  }

  return normalizeSuccessPayload(data);
}
