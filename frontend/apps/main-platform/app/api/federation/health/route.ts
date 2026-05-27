import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireNodeAuth, requireRole } from "@/app/api/_shared/node-auth";
import { checkCentralHealth } from "@/app/lib/server/federation/central-client";
import { toFederationErrorResponse } from "@/app/lib/server/federation/errors";
import {
  createFederationServiceHeaders,
  normalizeFederationServiceUrl,
} from "@/app/lib/server/federation/security";

export const dynamic = "force-dynamic";

type NodeHealthResult = {
  node: string;
  url: string;
  status: "ok" | "error";
  httpStatus?: number;
  detail?: string;
  body?: unknown;
};

function extractCentralNodeResults(centralBody: unknown): NodeHealthResult[] {
  if (!centralBody || typeof centralBody !== "object") return [];
  const nodes = (centralBody as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];

  return nodes
    .map((item): NodeHealthResult | null => {
      if (!item || typeof item !== "object") return null;
      const entry = item as {
        node?: unknown;
        url?: unknown;
        status?: unknown;
        http_status?: unknown;
        detail?: unknown;
        body?: unknown;
      };
      if (typeof entry.node !== "string" || typeof entry.url !== "string") return null;
      return {
        node: entry.node,
        url: entry.url,
        status: entry.status === "ok" ? "ok" : "error",
        httpStatus: typeof entry.http_status === "number" ? entry.http_status : undefined,
        detail: typeof entry.detail === "string" ? entry.detail : undefined,
        body: entry.body,
      };
    })
    .filter((item): item is NodeHealthResult => item !== null);
}

function parseNodeHealthUrls(): Array<{ node: string; url: string }> {
  const raw = process.env.FEDERATION_NODE_HEALTH_URLS?.trim();
  if (!raw) return [];

  const results: Array<{ node: string; url: string }> = [];
  for (const item of raw.split(",")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const [node, url] = trimmed.split("=", 2).map((x) => x?.trim() ?? "");
    if (!node || !url) continue;
    const normalized = normalizeFederationServiceUrl(url, "FEDERATION_NODE_HEALTH_URLS");
    results.push({ node, url: normalized });
  }
  return results;
}

async function checkNodeHealth(
  item: { node: string; url: string },
  requestId: string,
  timeoutMs: number,
): Promise<NodeHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${item.url}/health`, {
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

    if (!response.ok) {
      return {
        node: item.node,
        url: item.url,
        status: "error",
        httpStatus: response.status,
        detail: "节点健康检查失败",
        body,
      };
    }

    return {
      node: item.node,
      url: item.url,
      status: "ok",
      httpStatus: response.status,
      body,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        node: item.node,
        url: item.url,
        status: "error",
        detail: "节点健康检查超时",
      };
    }
    return {
      node: item.node,
      url: item.url,
      status: "error",
      detail: "无法连接节点",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseNodeTimeoutMs(): number {
  const raw = process.env.FEDERATION_NODE_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 8_000;
  return Math.floor(n);
}

export async function GET(request: NextRequest) {
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
    const central = await checkCentralHealth(requestId);
    const centralNodes = extractCentralNodeResults(central.central.body);

    const nodes = parseNodeHealthUrls();
    const nodeTimeoutMs = parseNodeTimeoutMs();
    const directNodeResults = await Promise.all(nodes.map((node) => checkNodeHealth(node, requestId, nodeTimeoutMs)));

    const mergedByNode = new Map<string, NodeHealthResult>();
    for (const item of centralNodes) {
      mergedByNode.set(item.node, item);
    }
    for (const item of directNodeResults) {
      mergedByNode.set(item.node, item);
    }
    const nodeResults = Array.from(mergedByNode.values());

    const hasCentralError = central.status !== "ok";
    const hasNodeError = nodeResults.some((node) => node.status !== "ok");
    const overallStatus: "ok" | "partial" | "error" =
      hasCentralError && nodeResults.length > 0
        ? "error"
        : hasCentralError || hasNodeError
          ? "partial"
          : "ok";

    return NextResponse.json({
      requestId,
      status: overallStatus,
      central: central.central,
      nodes: nodeResults,
    });
  } catch (error) {
    const normalized = toFederationErrorResponse(error, requestId);
    return NextResponse.json(normalized.body, { status: normalized.status });
  }
}
