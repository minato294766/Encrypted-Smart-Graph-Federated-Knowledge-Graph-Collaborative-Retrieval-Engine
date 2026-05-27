import {
  NODE_AUTH_HEADERS,
  resolveNodeRoleFromCenterFlag,
  type NodeAuthContext,
} from "@/app/lib/node-auth-contract";

const DEFAULT_ACCOUNT = "本机节点";

export function buildNodeAuthContext(input: {
  account: string;
  isSelfCenterNode: boolean;
  actor?: string;
}): NodeAuthContext {
  const account = input.account.trim() || DEFAULT_ACCOUNT;
  const role = resolveNodeRoleFromCenterFlag(input.isSelfCenterNode);
  const actor = input.actor?.trim();
  return {
    account,
    role,
    actor: actor || undefined,
  };
}

export function createNodeAuthHeaders(context: NodeAuthContext): HeadersInit {
  const headers: Record<string, string> = {
    [NODE_AUTH_HEADERS.account]: encodeURIComponent(context.account),
    [NODE_AUTH_HEADERS.role]: context.role,
  };

  if (context.actor) {
    headers[NODE_AUTH_HEADERS.actor] = encodeURIComponent(context.actor);
  }

  return headers;
}
