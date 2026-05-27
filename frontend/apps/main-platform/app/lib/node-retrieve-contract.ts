export interface NodeRetrieveDetail {
  clusterId: string;
  fileId: string;
  fileName: string;
  score: number;
  snippet: string;
}

export interface NodeRetrieveRequest {
  question: string;
  account: string;
  actor?: string;
}

export interface NodeRetrieveResponse {
  requestId: string;
  status: "ok" | "error";
  answer: string;
  details: NodeRetrieveDetail[];
  confidence?: number;
  mindscape_used?: boolean;
  evidence?: unknown[];
  parsed_query?: unknown;
}

export interface NodeApiErrorBody {
  error: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}
