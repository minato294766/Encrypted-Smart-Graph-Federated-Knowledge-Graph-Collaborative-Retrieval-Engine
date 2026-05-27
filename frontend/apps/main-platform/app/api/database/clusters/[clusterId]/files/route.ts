import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceAccountOwnership,
  requireNodeAuth,
} from "@/app/api/_shared/node-auth";
import { toNodeDatabaseErrorResponse } from "@/app/api/database/error-response";
import type {
  AddClusterFileBody,
  AddClusterFileRequest,
  AddClusterFileResponse,
  ListClusterFilesResponse,
} from "@/app/lib/cluster-files-contract";
import {
  addNodeClusterFile,
  listNodeClusterFiles,
  resolveNodeAccount,
} from "@/app/lib/server/node-data";

export const dynamic = "force-dynamic";

// GET /api/database/clusters/[clusterId]/files
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
) {
  const { clusterId } = await params;
  const requestId = req.headers.get("x-request-id") || "db-cluster-files-get";
  const authResult = requireNodeAuth(req, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  const rawAccount = req.nextUrl.searchParams.get("account")?.trim() ?? "";
  const ownerCheck = enforceAccountOwnership(authResult.context, rawAccount, requestId);
  if (ownerCheck) {
    return ownerCheck;
  }

  try {
    const ownerAccount = authResult.context.account || rawAccount;
    const files = (await listNodeClusterFiles({ account: ownerAccount, clusterId }))
      .map(({ textContent, contentBase64, ...meta }) => meta);
    return NextResponse.json<ListClusterFilesResponse>({ files });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}

const AddFileSchema = z.object({
  name: z.string().trim().min(1, "文件名不能为空"),
  size: z.number().nonnegative("文件大小不能为负数"),
  mimeType: z.string().min(1, "MIME 类型不能为空"),
  localPath: z.string().optional(),
  textContent: z.string().optional(),
  contentBase64: z.string().optional(),
  account: z.string().trim().min(1, "账号不能为空"),
  actor: z.string().trim().optional(),
});

// POST /api/database/clusters/[clusterId]/files
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
) {
  const { clusterId } = await params;
  const requestId = request.headers.get("x-request-id") || "db-cluster-files-post";
  const authResult = requireNodeAuth(request, requestId);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON 格式" }, { status: 400 });
  }

  const result = AddFileSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const payload: AddClusterFileRequest = result.data;
  const { account, actor, ...fileBody } = payload;
  const typedFileBody: AddClusterFileBody = fileBody;
  try {
    const ownerCheck = enforceAccountOwnership(authResult.context, account, requestId);
    if (ownerCheck) {
      return ownerCheck;
    }

    const requestAccount = authResult.context.account || account;
    const requestActor = actor ?? authResult.context.actor;
    const ownerAccount = resolveNodeAccount({ account: requestAccount, actor: requestActor });
    const file = await addNodeClusterFile({
      account: ownerAccount,
      clusterId,
      actor: requestActor,
      body: typedFileBody,
    });

    // 同步文件内容到 MiA-RAG 后端知识图谱
    const textContent = typedFileBody.textContent;
    if (textContent && textContent.trim().length > 50) {
      const miaRagUrl = process.env.MIA_RAG_NODE_URL?.trim();
      if (miaRagUrl) {
        try {
          const internalToken = process.env.FEDERATION_INTERNAL_TOKEN?.trim() ?? "";
          await fetch(`${miaRagUrl}/api/documents/insert`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(internalToken ? { "X-Federation-Token": internalToken } : {}),
            },
            body: JSON.stringify({ content: textContent }),
            signal: AbortSignal.timeout(30000),
          });
        } catch {
          // 静默失败，不影响上传响应
        }
      }
    }

    return NextResponse.json<AddClusterFileResponse>({ file }, { status: 201 });
  } catch (error) {
    return toNodeDatabaseErrorResponse(error);
  }
}
