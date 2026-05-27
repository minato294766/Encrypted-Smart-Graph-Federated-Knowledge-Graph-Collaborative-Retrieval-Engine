import { randomUUID } from "node:crypto";
import {
  CentralAskResponseSchema,
  FederationAskRequestSchema,
  type FederationNodeDetail,
} from "./schemas";
import { FederationHttpError } from "./errors";
import {
  createFederationServiceHeaders,
  normalizeFederationServiceUrl,
} from "./security";

const DEFAULT_CENTRAL_TIMEOUT_MS = 15_000;
const DEFAULT_CENTRAL_HEALTH_TIMEOUT_MS = 5_000;

type FederationStatus = "ok" | "partial" | "error";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function resolveCentralBaseUrl(): string {
  return normalizeFederationServiceUrl(process.env.FEDERATION_CENTRAL_BASE_URL, "FEDERATION_CENTRAL_BASE_URL");
}

function resolveStatusFromDetails(details: FederationNodeDetail[]): FederationStatus {
  if (details.length === 0) return "error";
  const okCount = details.filter((d) => d.status === "ok").length;
  if (okCount === 0) return "error";
  if (okCount < details.length) return "partial";
  return "ok";
}

// ── SM4 encryption via MiA-RAG backend ────────────────────────────────

async function sm4Encrypt(plaintext: string): Promise<string | null> {
  const miaRagUrl = process.env.MIA_RAG_NODE_URL?.trim();
  const sm4Key = process.env.FEDERATION_SM4_KEY?.trim();
  const internalToken = process.env.FEDERATION_INTERNAL_TOKEN?.trim() ?? "";

  if (!miaRagUrl || !sm4Key) return null;

  try {
    const res = await fetch(`${miaRagUrl}/api/sm4/encrypt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "X-Federation-Token": internalToken } : {}),
      },
      body: JSON.stringify({ plaintext }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { encrypted?: string };
    return data.encrypted ?? null;
  } catch {
    return null;
  }
}

async function sm4Decrypt(encrypted: string): Promise<string | null> {
  const miaRagUrl = process.env.MIA_RAG_NODE_URL?.trim();
  const internalToken = process.env.FEDERATION_INTERNAL_TOKEN?.trim() ?? "";

  if (!miaRagUrl) return null;

  try {
    const res = await fetch(`${miaRagUrl}/api/sm4/decrypt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "X-Federation-Token": internalToken } : {}),
      },
      body: JSON.stringify({ encrypted }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { plaintext?: string };
    return data.plaintext ?? null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────

export interface AskCentralResult {
  requestId: string;
  status: FederationStatus;
  answer: string;
  details: FederationNodeDetail[];
}

export async function askCentral(question: string, requestId: string = randomUUID()): Promise<AskCentralResult> {
  const parsed = FederationAskRequestSchema.safeParse({ question });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "参数错误";
    throw new FederationHttpError(422, "FEDERATION_BAD_REQUEST", message);
  }

  const baseUrl = resolveCentralBaseUrl();
  const timeoutMs = parsePositiveInt(process.env.FEDERATION_CENTRAL_TIMEOUT_MS, DEFAULT_CENTRAL_TIMEOUT_MS);

  // Try SM4 encryption for the query payload
  const encryptedQuery = await sm4Encrypt(parsed.data.question);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = encryptedQuery
      ? { encrypted_query: encryptedQuery }
      : { question: parsed.data.question };

    const response = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createFederationServiceHeaders(requestId),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      cache: "no-store",
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FederationHttpError(
        502,
        "FEDERATION_UPSTREAM_INVALID_JSON",
        "中心服务返回格式异常",
      );
    }

    if (!response.ok) {
      throw new FederationHttpError(
        502,
        "FEDERATION_UPSTREAM_HTTP_ERROR",
        "中心服务请求失败",
        {
          upstreamStatus: response.status,
          upstreamBody: payload,
        },
      );
    }

    // If response is encrypted, decrypt it
    const payloadObj = payload as Record<string, unknown>;
    if (payloadObj.encrypted_result && typeof payloadObj.encrypted_result === "string") {
      const decrypted = await sm4Decrypt(payloadObj.encrypted_result);
      if (decrypted) {
        try {
          payload = JSON.parse(decrypted);
        } catch {
          // If decryption succeeded but parsing failed, use as plain text answer
          payload = { answer: decrypted, details: [], status: "ok" };
        }
      }
    }

    const result = CentralAskResponseSchema.safeParse(payload);
    if (!result.success) {
      throw new FederationHttpError(
        502,
        "FEDERATION_UPSTREAM_SCHEMA_ERROR",
        "中心服务响应字段不合法",
        { issues: result.error.issues },
      );
    }

    const status = result.data.status ?? resolveStatusFromDetails(result.data.details);
    const resolvedRequestId = result.data.request_id ?? requestId;

    return {
      requestId: resolvedRequestId,
      status,
      answer: result.data.answer,
      details: result.data.details,
    };
  } catch (error) {
    if (error instanceof FederationHttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new FederationHttpError(
        504,
        "FEDERATION_UPSTREAM_TIMEOUT",
        "中心服务请求超时",
        { timeoutMs },
      );
    }
    throw new FederationHttpError(502, "FEDERATION_UPSTREAM_UNREACHABLE", "无法连接中心服务");
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCentralHealth(requestId: string = randomUUID()): Promise<{
  requestId: string;
  status: "ok" | "error";
  central: {
    url: string;
    status: "ok" | "error";
    httpStatus?: number;
    detail?: string;
    body?: unknown;
  };
}> {
  const baseUrl = resolveCentralBaseUrl();
  const timeoutMs = parsePositiveInt(process.env.FEDERATION_CENTRAL_HEALTH_TIMEOUT_MS, DEFAULT_CENTRAL_HEALTH_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: createFederationServiceHeaders(requestId),
      signal: controller.signal,
      cache: "no-store",
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const bodyStatus =
      body && typeof body === "object" && typeof (body as { status?: unknown }).status === "string"
        ? (body as { status: string }).status
        : undefined;

    if (!response.ok || (bodyStatus && bodyStatus !== "ok")) {
      return {
        requestId,
        status: "error",
        central: {
          url: baseUrl,
          status: "error",
          httpStatus: response.status,
          detail:
            !response.ok
              ? "中心服务检查失败"
              : `中心服务返回异常: ${bodyStatus}`,
          body,
        },
      };
    }

    return {
      requestId,
      status: "ok",
      central: {
        url: baseUrl,
        status: "ok",
        httpStatus: response.status,
        body,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        requestId,
        status: "error",
        central: {
          url: baseUrl,
          status: "error",
          detail: "中心服务检查超时",
        },
      };
    }

    return {
      requestId,
      status: "error",
      central: {
        url: baseUrl,
        status: "error",
        detail: "无法连接",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
