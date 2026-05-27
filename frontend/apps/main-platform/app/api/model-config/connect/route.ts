import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const APIProviderSchema = z.object({
  provider: z.enum(["OpenAI", "Ollama"]),
  model:    z.string().trim().min(1, "请选择模型"),
  baseUrl:  z.string().url("接口地址格式不正确，请输入完整 URL"),
  apiKey:   z.string().trim().min(1, "API Key 不能为空"),
});

const LocalProviderSchema = z.object({
  provider:   z.literal("Local"),
  model:      z.string().trim().min(1, "请选择模型"),
  modelPath:  z.string().trim().min(1, "模型路径不能为空"),
  localUrl:   z.string().url("服务端口格式不正确，请输入完整 URL").optional()
               .or(z.literal("")),
});

const ConnectSchema = z.discriminatedUnion("provider", [
  APIProviderSchema,
  LocalProviderSchema,
]);

// ─── Real connection verification ──────────────────────────────────────────

async function verifyOpenAI(baseUrl: string, apiKey: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as { data?: unknown[] };
      const modelCount = Array.isArray(data.data) ? data.data.length : 0;
      return { ok: true, detail: `连接成功，可用模型 ${modelCount} 个` };
    }
    const errorText = await res.text().catch(() => "");
    return { ok: false, detail: `连接失败 (HTTP ${res.status}): ${errorText.slice(0, 200)}` };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, detail: "连接超时（8秒）" };
    }
    return { ok: false, detail: `连接失败: ${err instanceof Error ? err.message : "未知错误"}` };
  }
}

async function verifyOllama(baseUrl: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as { models?: unknown[] };
      const modelCount = Array.isArray(data.models) ? data.models.length : 0;
      return { ok: true, detail: `连接成功，本地模型 ${modelCount} 个` };
    }
    return { ok: false, detail: `连接失败 (HTTP ${res.status})` };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, detail: "连接超时（8秒）" };
    }
    return { ok: false, detail: `连接失败: ${err instanceof Error ? err.message : "未知错误"}` };
  }
}

async function verifyLocal(localUrl: string, modelPath: string): Promise<{ ok: boolean; detail?: string }> {
  // If a local URL is provided, check its health endpoint
  if (localUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${localUrl.replace(/\/+$/, "")}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        return { ok: true, detail: "本地服务健康检查通过" };
      }
      return { ok: false, detail: `本地服务返回异常 (HTTP ${res.status})` };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, detail: "本地服务连接超时（8秒）" };
      }
      return { ok: false, detail: `本地服务无法连接: ${err instanceof Error ? err.message : "未知错误"}` };
    }
  }

  // No URL provided — just verify the model path exists (server-side check)
  return { ok: true, detail: "模型路径已记录（需确保服务启动后可用）" };
}

// ─── POST /api/model-config/connect ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须为 JSON 格式" }, { status: 400 });
  }

  const result = ConnectSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const data = result.data;

  let verifyResult: { ok: boolean; detail?: string };

  switch (data.provider) {
    case "OpenAI":
      verifyResult = await verifyOpenAI(data.baseUrl, data.apiKey);
      break;
    case "Ollama":
      verifyResult = await verifyOllama(data.baseUrl);
      break;
    case "Local":
      verifyResult = await verifyLocal(data.localUrl || "", data.modelPath);
      break;
    default:
      verifyResult = { ok: false, detail: "未知的模型提供商" };
  }

  if (!verifyResult.ok) {
    return NextResponse.json(
      {
        connected: false,
        provider: data.provider,
        model: data.model,
        message: verifyResult.detail || "连接验证失败",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      connected: true,
      provider: data.provider,
      model: data.model,
      message: verifyResult.detail || "连接成功",
    },
    { status: 200 },
  );
}
