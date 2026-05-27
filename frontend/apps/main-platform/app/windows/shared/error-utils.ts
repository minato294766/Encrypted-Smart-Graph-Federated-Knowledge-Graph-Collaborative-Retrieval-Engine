export function coerceClientError(reason: unknown, fallbackMessage: string): Error {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof reason === "string") {
    const normalized = reason.trim();
    if (normalized) {
      return new Error(normalized);
    }
  }

  if (reason && typeof reason === "object") {
    if ("message" in reason && typeof reason.message === "string") {
      const message = reason.message.trim();
      if (message) {
        return new Error(message);
      }
    }

    if (reason instanceof Event) {
      const eventType = reason.type || "unknown";
      const resource = describeEventResource(reason);
      const detail = resource ? `（event: ${eventType}; resource: ${resource}）` : `（event: ${eventType}）`;
      return new Error(`${fallbackMessage}${detail}`);
    }
  }

  return new Error(fallbackMessage);
}

function describeEventResource(event: Event): string | null {
  const target = event.target;
  if (!target || typeof target !== "object") {
    return null;
  }

  const resource = target as {
    src?: unknown;
    currentSrc?: unknown;
    href?: unknown;
    baseURI?: unknown;
  };

  if (typeof resource.currentSrc === "string" && resource.currentSrc.trim()) {
    return resource.currentSrc;
  }

  if (typeof resource.src === "string" && resource.src.trim()) {
    return resource.src;
  }

  if (typeof resource.href === "string" && resource.href.trim()) {
    return resource.href;
  }

  if (typeof resource.baseURI === "string" && resource.baseURI.trim()) {
    return resource.baseURI;
  }

  return null;
}
