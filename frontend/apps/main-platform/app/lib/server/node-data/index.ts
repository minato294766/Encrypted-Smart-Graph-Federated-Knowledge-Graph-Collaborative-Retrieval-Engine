import fs from "node:fs";
import path from "node:path";
import { prisma } from "../prisma";
import type { AddClusterFileBody, ClusterFile } from "@/app/lib/cluster-files-contract";
import type { Cluster, DatabaseUpdate, Metrics } from "@/app/lib/database-types";
import type { NodeRetrieveDetail, NodeRetrieveResponse } from "@/app/lib/node-retrieve-contract";

const DEFAULT_ACCOUNT = "本机节点";
const LEGACY_IMPORT_META_KEY = "legacy-json-import-v1";
const LEGACY_DB_STATE_FILE = path.join(process.cwd(), "data", "database-store.json");
const MAX_UPDATES = 200;
const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_CHUNK_OVERLAP = 120;

interface LegacyCluster {
  id?: string;
  name?: string;
  createdAt?: string;
}

interface LegacyUpdateEntry {
  actor?: string;
  action?: string;
  type?: string;
  timestamp?: number;
}

interface LegacyStoreShape {
  clusters?: LegacyCluster[];
  clusterFiles?: Record<string, ClusterFile[]>;
  updateLog?: LegacyUpdateEntry[];
}

function normalizeAccount(rawAccount?: string | null, fallbackActor?: string | null): string {
  const fromAccount = rawAccount?.trim() ?? "";
  if (fromAccount) return fromAccount;
  const fromActor = fallbackActor?.trim() ?? "";
  if (fromActor) return fromActor;
  return DEFAULT_ACCOUNT;
}

function normalizeActor(rawActor?: string | null, fallbackAccount?: string | null): string {
  const fromActor = rawActor?.trim() ?? "";
  if (fromActor) return fromActor;
  const fromAccount = fallbackAccount?.trim() ?? "";
  if (fromAccount) return fromAccount;
  return DEFAULT_ACCOUNT;
}

function parseDateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTimelineDate(date: Date): string {
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

function formatTimelineTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseLegacyDate(raw?: string): Date {
  if (!raw) return new Date();
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function readLegacyStore(): LegacyStoreShape | null {
  if (!fs.existsSync(LEGACY_DB_STATE_FILE)) return null;
  try {
    const raw = fs.readFileSync(LEGACY_DB_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as LegacyStoreShape;
  } catch {
    return null;
  }
}

function toClusterFile(record: {
  id: string;
  clusterId: string;
  name: string;
  size: number;
  mimeType: string;
  localPath: string | null;
  textContent: string | null;
  contentBase64: string | null;
  addedAt: Date;
}): ClusterFile {
  return {
    id: record.id,
    clusterId: record.clusterId,
    name: record.name,
    size: record.size,
    mimeType: record.mimeType,
    localPath: record.localPath ?? undefined,
    textContent: record.textContent ?? undefined,
    contentBase64: record.contentBase64 ?? undefined,
    addedAt: parseDateToDay(record.addedAt),
  };
}

function sanitizeText(text: string): string {
  // Remove lone surrogates and other invalid Unicode characters
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

function splitTextChunks(content: string): string[] {
  const sanitized = sanitizeText(content);
  const normalized = sanitized.trim();
  if (!normalized) return [];
  if (normalized.length <= DEFAULT_CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + DEFAULT_CHUNK_SIZE);
    chunks.push(normalized.slice(cursor, end));
    if (end >= normalized.length) break;
    cursor = Math.max(0, end - DEFAULT_CHUNK_OVERLAP);
  }
  return chunks;
}

async function appendAuditLog(args: {
  ownerAccount: string;
  actor?: string | null;
  action: string;
  type: "cluster" | "file" | "admin";
  targetId?: string;
  detail?: unknown;
}) {
  await prisma.nodeAuditLog.create({
    data: {
      ownerAccount: args.ownerAccount,
      actor: normalizeActor(args.actor, args.ownerAccount),
      action: args.action,
      type: args.type,
      targetId: args.targetId,
      detail: args.detail === undefined ? undefined : (args.detail as object),
    },
  });
}

async function ensureLegacyImported(ownerAccount: string): Promise<void> {
  const meta = await prisma.nodeStorageMeta.findUnique({
    where: {
      ownerAccount_key: {
        ownerAccount,
        key: LEGACY_IMPORT_META_KEY,
      },
    },
  });
  if (meta) return;

  const legacy = readLegacyStore();
  if (!legacy?.clusters?.length) {
    await prisma.nodeStorageMeta.create({
      data: {
        ownerAccount,
        key: LEGACY_IMPORT_META_KEY,
        value: "no_legacy_source",
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const legacyClusterIdMap = new Map<string, string>();

    for (const cluster of legacy.clusters ?? []) {
      const clusterName = cluster.name?.trim();
      if (!clusterName) continue;
      const row = await tx.nodeCluster.upsert({
        where: {
          ownerAccount_name: {
            ownerAccount,
            name: clusterName,
          },
        },
        update: {},
        create: {
          ownerAccount,
          name: clusterName,
          createdAt: parseLegacyDate(cluster.createdAt),
        },
      });
      if (cluster.id) {
        legacyClusterIdMap.set(cluster.id, row.id);
      }
    }

    for (const [legacyClusterId, files] of Object.entries(legacy.clusterFiles ?? {})) {
      const mappedClusterId = legacyClusterIdMap.get(legacyClusterId);
      if (!mappedClusterId || !Array.isArray(files) || files.length === 0) continue;

      for (const file of files) {
        const fileName = file.name?.trim();
        if (!fileName) continue;

        const createdFile = await tx.nodeFile.create({
          data: {
            ownerAccount,
            clusterId: mappedClusterId,
            name: fileName,
            size: Number.isFinite(file.size) ? Math.max(0, Math.floor(file.size)) : 0,
            mimeType: file.mimeType?.trim() || "application/octet-stream",
            localPath: file.localPath?.trim() || null,
            textContent: file.textContent ?? null,
            contentBase64: file.contentBase64 ?? null,
            addedAt: parseLegacyDate(file.addedAt),
          },
        });

        const sourceText = file.textContent ?? "";
        const chunks = splitTextChunks(sourceText);
        if (chunks.length > 0) {
          await tx.nodeFileChunk.createMany({
            data: chunks.map((chunk, idx) => ({
              ownerAccount,
              fileId: createdFile.id,
              chunkIndex: idx,
              content: chunk,
            })),
          });
        }
      }
    }

    const auditRows = (legacy.updateLog ?? [])
      .filter((entry) => typeof entry.action === "string" && entry.action.trim())
      .map((entry) => {
        const createdAt =
          typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)
            ? new Date(entry.timestamp)
            : new Date();
        return {
          ownerAccount,
          actor: normalizeActor(entry.actor, ownerAccount),
          action: entry.action!.trim(),
          type: entry.type === "cluster" || entry.type === "file" ? entry.type : "admin",
          createdAt,
        };
      });

    if (auditRows.length > 0) {
      await tx.nodeAuditLog.createMany({ data: auditRows });
    } else {
      await tx.nodeAuditLog.create({
        data: {
          ownerAccount,
          actor: ownerAccount,
          action: "已完成旧版 JSON 数据迁移",
          type: "admin",
        },
      });
    }

    await tx.nodeStorageMeta.create({
      data: {
        ownerAccount,
        key: LEGACY_IMPORT_META_KEY,
        value: `imported_clusters=${legacyClusterIdMap.size}`,
      },
    });
  });
}

function scoreChunkByTokens(chunkContent: string, tokens: string[]): number {
  if (!chunkContent || tokens.length === 0) return 0;
  let score = 0;
  const lower = chunkContent.toLowerCase();
  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (!normalized) continue;
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(normalized, from);
      if (idx < 0) break;
      score += 1;
      from = idx + normalized.length;
    }
  }
  return score;
}

function tokenizeQuestion(question: string): string[] {
  return question
    .trim()
    .split(/[\s,，。！？；：、()（）\[\]{}“”"'`<>《》]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function resolveNodeAccount(input: { account?: string | null; actor?: string | null }): string {
  return normalizeAccount(input.account, input.actor);
}

export async function listNodeClusters(account: string): Promise<Cluster[]> {
  const ownerAccount = normalizeAccount(account);
  await ensureLegacyImported(ownerAccount);

  const rows = await prisma.nodeCluster.findMany({
    where: { ownerAccount },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { files: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    fileCount: row._count.files,
    createdAt: parseDateToDay(row.createdAt),
  }));
}

export async function createNodeCluster(args: {
  account: string;
  name: string;
  actor?: string;
}): Promise<Cluster> {
  const ownerAccount = normalizeAccount(args.account, args.actor);
  const actor = normalizeActor(args.actor, ownerAccount);

  const row = await prisma.nodeCluster.create({
    data: {
      ownerAccount,
      name: args.name.trim(),
    },
  });

  await appendAuditLog({
    ownerAccount,
    actor,
    action: `新建了聚类《${row.name}》`,
    type: "cluster",
    targetId: row.id,
  });

  return {
    id: row.id,
    name: row.name,
    fileCount: 0,
    createdAt: parseDateToDay(row.createdAt),
  };
}

export async function deleteNodeCluster(args: {
  account: string;
  clusterId: string;
  actor?: string;
}): Promise<boolean> {
  const ownerAccount = normalizeAccount(args.account, args.actor);
  const actor = normalizeActor(args.actor, ownerAccount);

  const cluster = await prisma.nodeCluster.findFirst({
    where: {
      id: args.clusterId,
      ownerAccount,
    },
    select: { id: true, name: true },
  });

  if (!cluster) return false;

  await prisma.nodeCluster.delete({ where: { id: cluster.id } });
  await appendAuditLog({
    ownerAccount,
    actor,
    action: `删除了聚类《${cluster.name}》`,
    type: "cluster",
    targetId: cluster.id,
  });

  return true;
}

export async function listNodeClusterFiles(args: {
  account: string;
  clusterId: string;
}): Promise<ClusterFile[]> {
  const ownerAccount = normalizeAccount(args.account);
  await ensureLegacyImported(ownerAccount);

  const rows = await prisma.nodeFile.findMany({
    where: {
      ownerAccount,
      clusterId: args.clusterId,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      clusterId: true,
      name: true,
      size: true,
      mimeType: true,
      localPath: true,
      textContent: true,
      contentBase64: true,
      addedAt: true,
    },
  });

  return rows.map(toClusterFile);
}

export async function getNodeClusterFile(args: {
  account: string;
  clusterId: string;
  fileId: string;
}): Promise<ClusterFile | null> {
  const ownerAccount = normalizeAccount(args.account);

  const row = await prisma.nodeFile.findFirst({
    where: {
      id: args.fileId,
      clusterId: args.clusterId,
      ownerAccount,
    },
    select: {
      id: true,
      clusterId: true,
      name: true,
      size: true,
      mimeType: true,
      localPath: true,
      textContent: true,
      contentBase64: true,
      addedAt: true,
    },
  });

  return row ? toClusterFile(row) : null;
}

export async function addNodeClusterFile(args: {
  account: string;
  clusterId: string;
  actor?: string;
  body: AddClusterFileBody;
}): Promise<ClusterFile> {
  const ownerAccount = normalizeAccount(args.account, args.actor);
  const actor = normalizeActor(args.actor, ownerAccount);

  const cluster = await prisma.nodeCluster.findFirst({
    where: {
      id: args.clusterId,
      ownerAccount,
    },
    select: { id: true, name: true },
  });
  if (!cluster) {
    throw new Error("聚类不存在或无权限访问");
  }

  const file = await prisma.nodeFile.create({
    data: {
      ownerAccount,
      clusterId: cluster.id,
      name: args.body.name.trim(),
      size: Math.max(0, Math.floor(args.body.size)),
      mimeType: args.body.mimeType,
      localPath: args.body.localPath?.trim() || null,
      textContent: args.body.textContent ? sanitizeText(args.body.textContent) : null,
      contentBase64: args.body.contentBase64 ?? null,
    },
    select: {
      id: true,
      clusterId: true,
      name: true,
      size: true,
      mimeType: true,
      localPath: true,
      textContent: true,
      contentBase64: true,
      addedAt: true,
    },
  });

  const chunks = splitTextChunks(args.body.textContent ?? "");
  if (chunks.length > 0) {
    await prisma.nodeFileChunk.createMany({
      data: chunks.map((chunk, idx) => ({
        ownerAccount,
        fileId: file.id,
        chunkIndex: idx,
        content: chunk,
      })),
    });
  }

  await appendAuditLog({
    ownerAccount,
    actor,
    action: `上传文件至《${cluster.name}》`,
    type: "file",
    targetId: file.id,
    detail: {
      fileName: file.name,
      clusterName: cluster.name,
      chunkCount: chunks.length,
    },
  });

  return toClusterFile(file);
}

export async function deleteNodeClusterFile(args: {
  account: string;
  clusterId: string;
  fileId: string;
  actor?: string;
}): Promise<boolean> {
  const ownerAccount = normalizeAccount(args.account, args.actor);
  const actor = normalizeActor(args.actor, ownerAccount);

  const file = await prisma.nodeFile.findFirst({
    where: {
      id: args.fileId,
      clusterId: args.clusterId,
      ownerAccount,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!file) return false;

  await prisma.nodeFile.delete({ where: { id: file.id } });
  await appendAuditLog({
    ownerAccount,
    actor,
    action: `删除文件《${file.name}》`,
    type: "file",
    targetId: file.id,
  });

  return true;
}

export async function getNodeMetrics(account: string): Promise<Metrics> {
  const ownerAccount = normalizeAccount(account);
  await ensureLegacyImported(ownerAccount);

  const [clusterCount, totalFiles, latestFile] = await Promise.all([
    prisma.nodeCluster.count({ where: { ownerAccount } }),
    prisma.nodeFile.count({ where: { ownerAccount } }),
    prisma.nodeFile.findFirst({
      where: { ownerAccount },
      orderBy: { addedAt: "desc" },
      select: { addedAt: true },
    }),
  ]);

  return {
    clusterCount,
    totalFiles,
    lastAddedDate: latestFile ? parseDateToDay(latestFile.addedAt) : null,
  };
}

export async function listNodeUpdates(account: string, limit: number = MAX_UPDATES): Promise<DatabaseUpdate[]> {
  const ownerAccount = normalizeAccount(account);
  await ensureLegacyImported(ownerAccount);

  const rows = await prisma.nodeAuditLog.findMany({
    where: { ownerAccount },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, MAX_UPDATES)),
    select: {
      id: true,
      actor: true,
      action: true,
      type: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    type: row.type === "cluster" || row.type === "file" ? row.type : "admin",
    date: formatTimelineDate(row.createdAt),
    time: formatTimelineTime(row.createdAt),
    timestamp: row.createdAt.getTime(),
  }));
}

export async function retrieveNodeAnswer(args: {
  account: string;
  question: string;
}): Promise<Omit<NodeRetrieveResponse, "requestId">> {
  const ownerAccount = normalizeAccount(args.account);
  await ensureLegacyImported(ownerAccount);

  const question = args.question.trim();
  if (!question) {
    return {
      status: "error",
      answer: "问题不能为空",
      details: [],
    };
  }

  const tokens = tokenizeQuestion(question);
  const chunks = await prisma.nodeFileChunk.findMany({
    where: { ownerAccount },
    orderBy: { createdAt: "desc" },
    take: 600,
    select: {
      id: true,
      content: true,
      file: {
        select: {
          id: true,
          name: true,
          clusterId: true,
        },
      },
    },
  });

  const scored = chunks
    .map((item) => {
      const score = scoreChunkByTokens(item.content, tokens);
      return {
        clusterId: item.file.clusterId,
        fileId: item.file.id,
        fileName: item.file.name,
        score,
        snippet: item.content.slice(0, 180),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) {
    const fallbackFiles = await prisma.nodeFile.findMany({
      where: { ownerAccount },
      orderBy: { addedAt: "desc" },
      take: 3,
      select: {
        id: true,
        clusterId: true,
        name: true,
        textContent: true,
      },
    });

    if (fallbackFiles.length === 0) {
      return {
        status: "error",
        answer: "当前节点数据库暂无可检索文献，请先上传文件。",
        details: [],
      };
    }

    const details = fallbackFiles.map((file) => ({
      clusterId: file.clusterId,
      fileId: file.id,
      fileName: file.name,
      score: 0,
      snippet: (file.textContent ?? "").slice(0, 180),
    }));

    return {
      status: "ok",
      answer: `未命中高相关片段，已返回最近文献供参考：${details.map((d) => d.fileName).join("、")}`,
      details,
    };
  }

  const answer = [
    "已基于本节点 SQL 文献命中以下高相关片段：",
    ...scored.map((item, idx) => `${idx + 1}. ${item.fileName}（score=${item.score}）`),
  ].join("\n");

  return {
    status: "ok",
    answer,
    details: scored,
  };
}

export async function recordNodeAdminAction(args: {
  account: string;
  actor?: string;
  requestType: string;
  remark?: string;
}) {
  const ownerAccount = normalizeAccount(args.account, args.actor);
  const actor = normalizeActor(args.actor, ownerAccount);
  const action = `管理员动作：${args.requestType}`;

  await appendAuditLog({
    ownerAccount,
    actor,
    action,
    type: "admin",
    detail: {
      requestType: args.requestType,
      remark: args.remark ?? "",
    },
  });

  return {
    ok: true,
    action,
  };
}
