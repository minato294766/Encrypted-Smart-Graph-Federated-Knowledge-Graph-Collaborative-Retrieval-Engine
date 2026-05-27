// Shared contract types for cluster files.
// Keep this file dependency-free so it can be imported by both client components and API routes.
// When switching from in-memory to Prisma/S3, only the implementation changes — not these types.

export interface ClusterFile {
  id: string;
  clusterId: string;
  name: string;
  size: number;       // bytes
  mimeType: string;
  addedAt: string;    // ISO date YYYY-MM-DD
  localPath?: string; // populated only in Electron/desktop context
  textContent?: string;
  contentBase64?: string;
}

export interface ListClusterFilesResponse {
  files: ClusterFile[];
}

export interface GetClusterFileResponse {
  file: ClusterFile;
}

export interface AddClusterFileBody {
  name: string;
  size: number;
  mimeType: string;
  localPath?: string;
  textContent?: string;
  contentBase64?: string;
}

export interface ClusterOwnerPayload {
  account: string;
  actor?: string;
}

export interface AddClusterFileRequest extends AddClusterFileBody, ClusterOwnerPayload {}

export interface AddClusterFileResponse {
  file: ClusterFile;
}

export interface DeleteClusterFileRequest extends ClusterOwnerPayload {}

export interface DeleteClusterFileResponse {
  ok: boolean;
}

export interface OpenFileRequest {
  fileId: string;
  localPath?: string;
}

export interface OpenFileResponse {
  ok: boolean;
  error?: string;
}
