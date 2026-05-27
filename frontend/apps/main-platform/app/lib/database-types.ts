export interface DatabaseUpdate {
  id: string;
  time: string;
  date: string;
  actor: string;
  action: string;
  type: "cluster" | "file" | "admin";
  timestamp: number;
}

export interface Cluster {
  id: string;
  name: string;
  fileCount: number;
  createdAt: string;
}

export interface Metrics {
  clusterCount: number;
  totalFiles: number;
  lastAddedDate: string | null;
}
