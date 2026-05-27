/**
 * auth-adapter.ts — 认证接口适配层
 *
 * 优先调用真实 MiA-RAG 后端（NEXT_PUBLIC_MIA_RAG_AUTH_URL 已设置时）。
 * 未设置时回退到前端 mock（适用于纯前端演示 / 未启动后端的场景）。
 * 调用方（LoginForm）无需任何改动。
 */

export interface LoginParams {
  account: string;
  password: string;
}

export interface LoginResult {
  ok: boolean;
  isAdmin: boolean;
  errorMessage?: string;
}

export interface RegisterParams {
  account: string;
  password: string;
}

export interface RegisterResult {
  ok: boolean;
  errorMessage?: string;
}

const MIA_RAG_AUTH_URL = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MIA_RAG_AUTH_URL?.trim()) || "";

// ── Mock 凭证（仅 MIA_RAG_AUTH_URL 未配置时生效） ───────────────
const ADMIN_ACCOUNT = "admin";
const ADMIN_PASSWORD = "311311";

export const MIA_RAG_TOKEN_KEY = "mia_rag_token";

export async function authLogin(params: LoginParams): Promise<LoginResult> {
  if (MIA_RAG_AUTH_URL) {
    try {
      const res = await fetch(`${MIA_RAG_AUTH_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: params.account, password: params.password }),
      });
      if (!res.ok) {
        const data = await res.json() as { detail?: string };
        return { ok: false, isAdmin: false, errorMessage: data.detail ?? "登录失败" };
      }
      const data = await res.json() as { access_token: string; user: { role: string } };
      if (typeof window !== "undefined") {
        localStorage.setItem(MIA_RAG_TOKEN_KEY, data.access_token);
      }
      return { ok: true, isAdmin: data.user.role === "admin" };
    } catch {
      return { ok: false, isAdmin: false, errorMessage: "无法连接认证服务，请确认后端已启动" };
    }
  }

  // ── Mock 回退 ──────────────────────────────────────────────────
  await new Promise<void>((resolve) => setTimeout(resolve, 220));

  if (params.account === ADMIN_ACCOUNT && params.password === ADMIN_PASSWORD) {
    return { ok: true, isAdmin: true };
  }

  return { ok: false, isAdmin: false, errorMessage: "账号不存在，请注册" };
}

export async function authRegister(params: RegisterParams): Promise<RegisterResult> {
  if (MIA_RAG_AUTH_URL) {
    try {
      const res = await fetch(`${MIA_RAG_AUTH_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: params.account, password: params.password }),
      });
      if (!res.ok) {
        const data = await res.json() as { detail?: string };
        return { ok: false, errorMessage: data.detail ?? "申请注册失败" };
      }
      // 注册成功，返回待审核状态
      return { ok: true };
    } catch {
      return { ok: false, errorMessage: "无法连接认证服务，请确认后端已启动" };
    }
  }

  // ── Mock 回退（注册申请发送给管理员后挂起，等待同意） ─────────
  await new Promise<void>((resolve) => setTimeout(resolve, 600));
  void params;
  return { ok: true };
}
