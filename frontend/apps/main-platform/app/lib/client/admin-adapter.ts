/**
 * admin-adapter.ts — 管理员数据接口适配层
 *
 * 接入真实后端 API（NEXT_PUBLIC_MIA_RAG_AUTH_URL）。
 */

import { MIA_RAG_TOKEN_KEY } from "./auth-adapter";

export type NodeType = "普通节点" | "中心节点";

export interface AdminUser {
  account: string;
  nodeName: string;
  fileCount: number;
  nodeType: NodeType;
}

export type RequestType =
  | "注册账号"
  | "更改节点名称"
  | "更改节点位置"
  | "申请成为中心节点"
  | "申请还原为普通节点"
  | "配置法官模型";

export interface AdminRequest {
  id: string;
  account: string;
  requestType: RequestType;
  remark: string;
  createdAt: string;
}

export interface AdminHistory {
  id: string;
  account: string;
  requestType: RequestType;
  remark: string;
  approvedAt: string;
}

export interface ApproveResult {
  ok: boolean;
  errorMessage?: string;
}

interface PendingUser {
  id: number;
  username: string;
  email: string | null;
  created_at: string;
}

const AUTH_URL = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MIA_RAG_AUTH_URL?.trim()) || "";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(MIA_RAG_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── 用户列表 ────────────────────────────────────────────────────

export async function adminListUsers(): Promise<AdminUser[]> {
  if (!AUTH_URL) return [];

  try {
    const res = await fetch(`${AUTH_URL}/api/admin/users`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as AdminUser[];
    return data;
  } catch {
    return [];
  }
}

// ── 待审核用户注册 ──────────────────────────────────────────────

export async function adminListRequests(): Promise<AdminRequest[]> {
  if (!AUTH_URL) return [];

  try {
    // 获取待审核的用户注册
    const res = await fetch(`${AUTH_URL}/api/admin/pending-users`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const pendingUsers = await res.json() as PendingUser[];

    // 转换为 AdminRequest 格式
    return pendingUsers.map((u) => ({
      id: String(u.id),
      account: u.username,
      requestType: "注册账号" as RequestType,
      remark: "",
      createdAt: u.created_at.slice(0, 10),
    }));
  } catch {
    return [];
  }
}

// ── 历史记录（暂用空列表） ──────────────────────────────────────

export async function adminListHistory(): Promise<AdminHistory[]> {
  if (!AUTH_URL) return [];

  try {
    const res = await fetch(`${AUTH_URL}/api/admin/history`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { id: string; account: string; requestType: string; remark: string; approvedAt: string }[];
    return data.map((h) => ({
      id: h.id,
      account: h.account,
      requestType: h.requestType as RequestType,
      remark: h.remark,
      approvedAt: h.approvedAt,
    }));
  } catch {
    return [];
  }
}

// ── 提交申请 ────────────────────────────────────────────────────

export async function adminSubmitRequest(
  account: string,
  type: RequestType,
  remark: string,
): Promise<void> {
  if (!AUTH_URL) return;

  await fetch(`${AUTH_URL}/api/admin/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ requestType: type, remark }),
  });
}

// ── 审核通过 ────────────────────────────────────────────────────

export async function adminApproveRequest(requestId: string): Promise<ApproveResult> {
  if (!AUTH_URL) return { ok: false, errorMessage: "后端未配置" };

  try {
    // 尝试审核用户注册
    const res = await fetch(`${AUTH_URL}/api/admin/users/${requestId}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ approved: true }),
    });

    if (!res.ok) {
      const data = await res.json() as { detail?: string };
      return { ok: false, errorMessage: data.detail ?? "审核失败" };
    }

    return { ok: true };
  } catch {
    return { ok: false, errorMessage: "网络错误" };
  }
}
