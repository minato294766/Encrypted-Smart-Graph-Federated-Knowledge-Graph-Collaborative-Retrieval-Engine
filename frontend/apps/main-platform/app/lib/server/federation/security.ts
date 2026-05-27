import { FederationHttpError } from "./errors";

function isEnvFalse(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "false";
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function requiresFederationTls(): boolean {
  return !isEnvFalse(process.env.FEDERATION_REQUIRE_TLS);
}

function allowsHttpForLoopback(): boolean {
  return !isEnvFalse(process.env.FEDERATION_ALLOW_HTTP_LOCALHOST);
}

function requiresInternalToken(): boolean {
  return !isEnvFalse(process.env.FEDERATION_REQUIRE_INTERNAL_TOKEN);
}

export function normalizeFederationServiceUrl(rawValue: string | undefined, envName: string): string {
  const value = rawValue?.trim();
  if (!value) {
    throw new FederationHttpError(
      500,
      "FEDERATION_CONFIG_MISSING",
      `未配置联邦服务地址: ${envName}`,
      { env: envName },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FederationHttpError(
      500,
      "FEDERATION_CONFIG_INVALID",
      "联邦服务地址格式无效",
      { env: envName, value },
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new FederationHttpError(
      500,
      "FEDERATION_CONFIG_INVALID",
      "联邦服务地址协议必须为 http 或 https",
      { env: envName, protocol: parsed.protocol },
    );
  }

  if (requiresFederationTls() && protocol !== "https:") {
    const loopbackAllowed = allowsHttpForLoopback() && isLoopbackHost(parsed.hostname);
    if (!loopbackAllowed) {
      throw new FederationHttpError(
        500,
        "FEDERATION_TLS_REQUIRED",
        "联邦服务必须使用 HTTPS（仅本机回环地址可例外使用 HTTP）",
        { env: envName, url: value },
      );
    }
  }

  return parsed.toString().replace(/\/$/, "");
}

export function resolveFederationInternalToken(): string | null {
  const token = process.env.FEDERATION_INTERNAL_TOKEN?.trim();
  if (token) return token;

  if (requiresInternalToken()) {
    throw new FederationHttpError(
      500,
      "FEDERATION_CONFIG_MISSING",
      "缺少联邦内部鉴权令牌",
      { env: "FEDERATION_INTERNAL_TOKEN" },
    );
  }

  return null;
}

export function createFederationServiceHeaders(requestId: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Request-Id": requestId,
  };

  const token = resolveFederationInternalToken();
  if (token) {
    headers["X-Federation-Token"] = token;
  }

  return headers;
}
