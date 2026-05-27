import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import type {
  NodeRetrieveRequest,
  NodeRetrieveResponse,
} from "@/app/lib/node-retrieve-contract";

export const dynamic = "force-dynamic";

const RetrieveSchema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(4000, "问题长度不能超过 4000 字符"),
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().min(1, "节点名称不能为空").optional(),
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

  const parsed = RetrieveSchema.safeParse(body);
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
    const payload: NodeRetrieveRequest = parsed.data;
    const ownerCheck = enforceAccountOwnership(authResult.context, payload.account, requestId);
    if (ownerCheck) {
      return ownerCheck;
    }

    // ── MiA-RAG backend (required) ──────────────────────────────
    const miaRagUrl = process.env.MIA_RAG_NODE_URL?.trim();
    if (!miaRagUrl) {
      return NextResponse.json(
        {
          error: {
            code: "MIA_RAG_NOT_CONFIGURED",
            message: "MiA-RAG 后端未配置，请设置 MIA_RAG_NODE_URL 环境变量",
            requestId,
          },
        },
        { status: 503 },
      );
    }

    const internalToken = process.env.FEDERATION_INTERNAL_TOKEN?.trim() ?? "";
    const miaController = new AbortController();
    const miaTimeout = setTimeout(() => miaController.abort(), 30_000);

    try {
      const miaRes = await fetch(`${miaRagUrl}/api/query/internal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          ...(internalToken ? { "X-Federation-Token": internalToken } : {}),
        },
        body: JSON.stringify({ question: payload.question }),
        signal: miaController.signal,
        cache: "no-store",
      });
      clearTimeout(miaTimeout);

      if (!miaRes.ok) {
        const errorBody = await miaRes.text().catch(() => "");
        return NextResponse.json(
          {
            error: {
              code: "MIA_RAG_UPSTREAM_ERROR",
              message: `MiA-RAG 后端返回错误 (HTTP ${miaRes.status})`,
              detail: errorBody.slice(0, 500),
              requestId,
            },
          },
          { status: 502 },
        );
      }

      const miaData = await miaRes.json() as {
        requestId?: string;
        status?: string;
        answer?: string;
        details?: unknown[];
        confidence?: number;
        mindscape_used?: boolean;
        evidence?: unknown[];
        parsed_query?: unknown;
      };

      const details = (miaData.details ?? []).map((item) => {
        const d = item as { source?: string; content?: string; score?: number };
        return {
          clusterId: d.source ?? "mia-rag",
          fileId: d.source ?? "mia-rag",
          fileName: d.source ?? "MiA-RAG",
          score: typeof d.score === "number" ? d.score : 0,
          snippet: d.content ?? "",
        };
      });

      return NextResponse.json<NodeRetrieveResponse>(
        {
          requestId,
          status: "ok",
          answer: miaData.answer ?? "",
          details,
          confidence: miaData.confidence,
          mindscape_used: miaData.mindscape_used,
          evidence: miaData.evidence,
          parsed_query: miaData.parsed_query,
        },
        { status: 200 },
      );
    } catch (err) {
      clearTimeout(miaTimeout);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return NextResponse.json(
        {
          error: {
            code: isTimeout ? "MIA_RAG_TIMEOUT" : "MIA_RAG_UNREACHABLE",
            message: isTimeout
              ? "MiA-RAG 后端请求超时"
              : "MiA-RAG 后端无法连接",
            requestId,
          },
        },
        { status: isTimeout ? 504 : 502 },
      );
    }
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
