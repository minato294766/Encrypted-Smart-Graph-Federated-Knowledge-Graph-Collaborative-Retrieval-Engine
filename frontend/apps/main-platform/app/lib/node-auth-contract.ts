export const NODE_AUTH_HEADERS = {
  account: "x-node-account",
  role: "x-node-role",
  actor: "x-node-actor",
} as const;

export type NodeRole = "normal" | "central";

export interface NodeAuthContext {
  account: string;
  role: NodeRole;
  actor?: string;
}

export function normalizeNodeRole(rawRole: string): NodeRole | null {
  const role = rawRole.trim().toLowerCase();
  if (role === "normal" || role === "central") return role;
  return null;
}

export function resolveNodeRoleFromCenterFlag(isSelfCenterNode: boolean): NodeRole {
  return isSelfCenterNode ? "central" : "normal";
}
