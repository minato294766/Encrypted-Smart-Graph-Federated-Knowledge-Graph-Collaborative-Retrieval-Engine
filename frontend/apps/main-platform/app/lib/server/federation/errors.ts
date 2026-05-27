export class FederationHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "FederationHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toFederationErrorResponse(error: unknown, requestId: string): {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      requestId: string;
      details?: unknown;
    };
  };
} {
  if (error instanceof FederationHttpError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          details: error.details,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "FEDERATION_INTERNAL_ERROR",
        message: "联邦服务暂不可用，请稍后重试",
        requestId,
      },
    },
  };
}
