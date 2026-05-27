import fs from "node:fs";
import path from "node:path";
import type { ClusterFile, AddClusterFileBody } from "./cluster-files-contract";
import { TRACE_REFERENCE_DOCS } from "./mock-qa-trace-data";

export interface DatabaseUpdate {
  id: string;
  time: string;
  date: string;
  actor: string;
  action: string;
  type: "cluster" | "file";
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

interface DatabaseState {
  version: number;
  clusters: Cluster[];
  clusterFiles: Record<string, ClusterFile[]>;
  updateLog: DatabaseUpdate[];
}

const DB_DATA_DIR = path.join(process.cwd(), "data");
const DB_STATE_FILE = path.join(DB_DATA_DIR, "database-store.json");
const DB_STORE_VERSION = 3;

const ACTOR_POOL = [
  "法学教研室",
  "马克思理论教研室",
  "大数据教研室",
  "党史教育中心",
  "图书馆-红色经典区",
  "图书馆-法律文献区",
  "语言实践中心",
  "本机节点",
] as const;

const REBUILT_CLUSTER_CATALOG: Array<{ id: string; name: string; createdAt: string }> = [
  { id: "cluster-civil", name: "民法学", createdAt: "2026-04-10" },
  { id: "cluster-criminal-law", name: "刑法学", createdAt: "2026-04-11" },
  { id: "cluster-criminal-procedure", name: "刑事诉讼法学", createdAt: "2026-04-12" },
  { id: "cluster-casebook", name: "真实案例汇编", createdAt: "2026-04-13" },
];

const TRACE_CLUSTER_NAME_TO_ID: Record<string, string> = {
  "民法学": "cluster-civil",
  "刑法学": "cluster-criminal-law",
  "刑事诉讼法学": "cluster-criminal-procedure",
  "真实案例汇编": "cluster-casebook",
};

const CASEBOOK_SUPPLEMENT_FILE_NAMES = [
  "建设工程分包合同无效后价款与利息裁判要点案例纪要.txt",
  "专利侵权与无效宣告并行程序审理路径案例纪要.txt",
  "中外合作经营企业合同欺诈与担保效力案例纪要.txt",
  "法定代表人调解确认债务对公司约束力案例纪要.txt",
  "案由选择错误导致程序偏离的纠正案例纪要.txt",
] as const;

let cache: DatabaseState | null = null;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateForTimeline(d: Date) {
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function normalizeActorName(actor?: string | null): string {
  const normalized = actor?.trim() ?? "";
  return normalized || "本机节点";
}

function ensureDataDir() {
  if (!fs.existsSync(DB_DATA_DIR)) {
    fs.mkdirSync(DB_DATA_DIR, { recursive: true });
  }
}

function saveState(state: DatabaseState) {
  ensureDataDir();
  const tmp = `${DB_STATE_FILE}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, DB_STATE_FILE);
}

function cloneState(state: DatabaseState): DatabaseState {
  return JSON.parse(JSON.stringify(state)) as DatabaseState;
}

function composeLegalArticle(clusterName: string, articleTitle: string): string {
  const intro = `《${articleTitle}》围绕${clusterName}领域展开，以现行法律规范、司法裁判逻辑与实务办理场景为主线，尝试在规范解释与问题导向之间建立可操作的分析框架。全文坚持“概念清晰、结构完整、论证连贯”的写作原则，避免口号式表述，而是通过制度背景、条文结构、裁判思路与风险治理四个维度，呈现能够直接进入研讨、授课与办案复盘的文章化内容。`;
  const body1 = `从制度背景看，近年来法治实践呈现两个显著趋势：其一，立法技术更强调体系化与衔接性，单条规则不再孤立运行，而是被放入权利义务配置、程序保障与责任承担的整体结构中理解；其二，司法裁判更强调说理充分与同案同判，裁判理由从“结果导向”逐步转向“规范—事实—结论”三段式展开。这意味着研究${clusterName}，不能只停留在条文摘录，而应关注规范如何在具体场景中被触发、被限制、被校正。`;
  const body2 = `就规范结构而言，核心问题通常表现为“构成要件识别、证明责任分配、裁量边界控制”三项任务。首先，构成要件识别决定案件是否进入对应规则轨道；其次，证明责任分配决定诉讼攻防中的风险承担；最后，裁量边界控制决定法律适用能否在个案公平与一般可预期之间维持平衡。若三者其中任何一环处理失衡，就可能出现形式合法但实质失衡的裁判后果。`;
  const body3 = `进入实务层面，常见争议并不在“是否有规则”，而在“规则之间如何排序”。例如，同一事实往往同时触发数个规范命题：一般规则与特别规则、实体请求与程序救济、行为评价与后果评价。处理这类争议，优先级判断应遵循三个标准：一是法条目的的贴合程度，二是事实要素的对应程度，三是裁判结果的社会可接受程度。只有在三项标准形成交叉印证时，结论才具有稳定性。`;
  const body4 = `在证据与论证方面，规范适用需要与证据结构保持一致。实务中常见的问题是“证据材料丰富但证明命题模糊”，导致事实认定无法精确对接法律要件。为避免这一问题，应先明确待证事实，再组织证据链条；先确定争点，再展开法律解释。换言之，法律论证不是把观点写得复杂，而是把事实与规则对应得清楚。对于关键节点，应同步说明排除其他路径的理由，从而提升裁判或结论的可复核性。`;
  const body5 = `风险治理维度同样不可忽视。无论是合同交易、平台治理、公共管理还是刑事追诉，规则设计最终都要回到风险预防与纠纷化解。研究${clusterName}时，如果只讨论“出了问题如何追责”，就会忽略“如何在前端降低冲突发生率”。因此，较优的治理方案应当同时包含前端合规、中端留痕、后端救济三层结构：前端通过制度与流程预防失范，中端通过文书与数据固化事实，后端通过责任与补救修复损害。`;
  const body6 = `结合近年来公开裁判文书与典型案例观察，司法机关在处理复杂案件时普遍呈现“原则先行、规则细化、事实校验”的方法论。一方面，法院会先确认最上位的价值目标，例如公平交易、人格尊严、程序正义、罪责刑相适应等；另一方面，再将抽象原则落入具体条文，形成可裁判的规范命题；最后通过证据审查对事实进行校验，确保结论不脱离个案基础。这一过程表明，法治运行不是机械套用条文，而是受约束的解释活动。`;
  const body7 = `从教学和研究视角看，${clusterName}文章写作应当避免两个极端：一是仅做法条罗列，缺乏问题意识；二是只谈价值判断，缺乏规范抓手。更可取的写法是以问题为起点、以规范为路径、以案例为验证。具体可以采用“问题提出—规则定位—事实映射—结论评估”的四步法。该方法既能兼顾理论深度，也能保持与办案实践的直接对话，使文章真正具备可读性与可用性。`;
  const closing = `综上，《${articleTitle}》并不追求给出唯一答案，而是提供一套可重复使用的分析框架：先识别争点，再配置规则；先厘清事实，再进入评价；先说明结论，再交代边界。只要坚持这一框架，${clusterName}中的多数复杂问题都可以被拆解为可讨论、可证明、可裁判的命题。对于实务人员而言，这意味着办案效率与论证质量能够同步提升；对于学习者而言，则意味着法律知识可以真正转化为处理现实问题的能力。`;

  let text = [intro, body1, body2, body3, body4, body5, body6, body7, closing].join("\n\n");
  const supplement = `为确保文章结构完整，本文特别强调三个复盘节点：第一，结论是否准确回应了最初争点；第二，证据链条是否覆盖关键构成要件；第三，解释路径是否具有可复制性。若任一节点存在缺口，均应回溯前文并补充论证。通过这一机制，法律分析不再停留在“意见表达”，而能上升为可检验的专业工作成果。`;

  while (text.length < 2050) {
    text += `\n\n${supplement}`;
  }
  return text;
}

function buildSeedClusterFiles(): Record<string, ClusterFile[]> {
  const clusterFiles: Record<string, ClusterFile[]> = Object.fromEntries(
    REBUILT_CLUSTER_CATALOG.map((cluster) => [cluster.id, [] as ClusterFile[]]),
  );

  TRACE_REFERENCE_DOCS.forEach((doc) => {
    const clusterId = TRACE_CLUSTER_NAME_TO_ID[doc.clusterName] ?? "cluster-casebook";
    const existing = clusterFiles[clusterId] ?? [];
    const nextIndex = existing.length + 1;
    const content = [
      `来源文献：${doc.sourceTitle}`,
      `Reference：${doc.refIndex}`,
      `溯源案例：${doc.traceCaseId}`,
      "",
      doc.fullText,
    ].join("\n");

    existing.push({
      id: `seed-file-${clusterId}-${nextIndex}`,
      clusterId,
      name: doc.fileName,
      size: Buffer.byteLength(content, "utf-8"),
      mimeType: "text/plain",
      addedAt: "2026-04-14",
      textContent: content,
    });
    clusterFiles[clusterId] = existing;
  });

  const casebookFiles = clusterFiles["cluster-casebook"] ?? [];
  CASEBOOK_SUPPLEMENT_FILE_NAMES.forEach((fileName, idx) => {
    const article = composeLegalArticle("真实案例汇编", fileName.replace(/\.[^.]+$/, ""));
    casebookFiles.push({
      id: `seed-file-cluster-casebook-sup-${idx + 1}`,
      clusterId: "cluster-casebook",
      name: fileName,
      size: Buffer.byteLength(article, "utf-8"),
      mimeType: "text/plain",
      addedAt: "2026-04-15",
      textContent: article,
    });
  });
  clusterFiles["cluster-casebook"] = casebookFiles;

  return clusterFiles;
}

function buildSeedState(): DatabaseState {
  const clusterFiles = buildSeedClusterFiles();
  const clusters: Cluster[] = REBUILT_CLUSTER_CATALOG.map((cluster) => ({
    id: cluster.id,
    name: cluster.name,
    createdAt: cluster.createdAt,
    fileCount: clusterFiles[cluster.id]?.length ?? 0,
  }));
  const updateLog: DatabaseUpdate[] = [];

  let minuteCursor = 0;
  clusters.forEach((cluster, clusterIdx) => {
    const clusterCreatedAt = new Date(`${cluster.createdAt}T08:30:00`);
    updateLog.unshift({
      id: `seed-upd-cluster-${cluster.id}`,
      time: `${pad2(clusterCreatedAt.getHours())}:${pad2(clusterCreatedAt.getMinutes())}`,
      date: formatDateForTimeline(clusterCreatedAt),
      actor: ACTOR_POOL[clusterIdx % ACTOR_POOL.length],
      action: `新建了聚类《${cluster.name}》`,
      type: "cluster",
      timestamp: clusterCreatedAt.getTime(),
    });

    const files = clusterFiles[cluster.id] ?? [];
    files.forEach((_file, fileIdx) => {
      const addedDate = new Date(`${cluster.createdAt}T09:00:00`);
      addedDate.setDate(addedDate.getDate() + Math.floor(fileIdx / 2));
      addedDate.setMinutes(addedDate.getMinutes() + minuteCursor);
      minuteCursor += 11;

      updateLog.unshift({
        id: `seed-upd-file-${cluster.id}-${fileIdx + 1}`,
        time: `${pad2(addedDate.getHours())}:${pad2(addedDate.getMinutes())}`,
        date: formatDateForTimeline(addedDate),
        actor: ACTOR_POOL[(clusterIdx + fileIdx + 1) % ACTOR_POOL.length],
        action: `上传文件至《${cluster.name}》`,
        type: "file",
        timestamp: addedDate.getTime(),
      });
    });
  });

  return {
    version: DB_STORE_VERSION,
    clusters,
    clusterFiles,
    updateLog: updateLog.sort((a, b) => b.timestamp - a.timestamp),
  };
}

function hydrateState(raw: unknown): DatabaseState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<DatabaseState>;
  if (!Array.isArray(obj.clusters) || !obj.clusterFiles || !Array.isArray(obj.updateLog)) {
    return null;
  }
  return {
    version: typeof obj.version === "number" ? obj.version : 0,
    clusters: obj.clusters,
    clusterFiles: obj.clusterFiles,
    updateLog: obj.updateLog,
  };
}

function getState(): DatabaseState {
  if (cache) return cache;

  ensureDataDir();
  if (!fs.existsSync(DB_STATE_FILE)) {
    cache = buildSeedState();
    saveState(cache);
    return cache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DB_STATE_FILE, "utf-8")) as unknown;
    const hydrated = hydrateState(parsed);
    if (!hydrated) throw new Error("invalid store file shape");

    if (hydrated.version !== DB_STORE_VERSION) {
      cache = buildSeedState();
      saveState(cache);
      return cache;
    }

    cache = hydrated;
    return cache;
  } catch {
    const corruptBackup = `${DB_STATE_FILE}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(DB_STATE_FILE, corruptBackup);
    } catch {
      // ignore backup failure
    }
    cache = buildSeedState();
    saveState(cache);
    return cache;
  }
}

function pushUpdate(state: DatabaseState, opts: {
  actor: string;
  action: string;
  type: "cluster" | "file";
  now: Date;
}) {
  const { actor, action, type, now } = opts;
  const entry: DatabaseUpdate = {
    id: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    date: formatDateForTimeline(now),
    actor,
    action,
    type,
    timestamp: now.getTime(),
  };
  state.updateLog.unshift(entry);
}

export function getClusters(): Cluster[] {
  const state = getState();
  return state.clusters.map((cluster) => ({ ...cluster }));
}

export function addCluster(name: string, actor?: string): Cluster {
  const state = getState();
  const now = new Date();
  const cluster: Cluster = {
    id: `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    fileCount: 0,
    createdAt: now.toISOString().slice(0, 10),
  };

  state.clusters.push(cluster);
  state.clusterFiles[cluster.id] = [];
  pushUpdate(state, {
    actor: normalizeActorName(actor),
    action: `新建了聚类《${name}》`,
    type: "cluster",
    now,
  });
  saveState(state);
  return { ...cluster };
}

export function deleteCluster(clusterId: string, actor?: string): boolean {
  const state = getState();
  const idx = state.clusters.findIndex((c) => c.id === clusterId);
  if (idx < 0) return false;

  const [cluster] = state.clusters.splice(idx, 1);
  delete state.clusterFiles[clusterId];

  pushUpdate(state, {
    actor: normalizeActorName(actor),
    action: `删除了聚类《${cluster.name}》`,
    type: "cluster",
    now: new Date(),
  });

  saveState(state);
  return true;
}

export function getMetrics(): Metrics {
  const state = getState();
  const totalFiles = state.clusters.reduce((sum, c) => sum + c.fileCount, 0);
  const lastAddedDate = state.updateLog.find((u) => u.type === "file")?.date.replace(/\./g, "-") ?? null;
  return {
    clusterCount: state.clusters.length,
    totalFiles,
    lastAddedDate,
  };
}

export function listClusterFiles(clusterId: string): ClusterFile[] {
  const state = getState();
  const files = state.clusterFiles[clusterId] ?? [];
  return files.map((f) => ({ ...f }));
}

export function getClusterFile(clusterId: string, fileId: string): ClusterFile | null {
  const state = getState();
  const files = state.clusterFiles[clusterId] ?? [];
  const found = files.find((file) => file.id === fileId);
  return found ? { ...found } : null;
}

export function addClusterFile(
  clusterId: string,
  body: AddClusterFileBody,
  actor?: string,
): ClusterFile {
  const state = getState();
  const cluster = state.clusters.find((c) => c.id === clusterId);
  const now = new Date();
  const file: ClusterFile = {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clusterId,
    addedAt: now.toISOString().slice(0, 10),
    ...body,
  };

  if (!state.clusterFiles[clusterId]) {
    state.clusterFiles[clusterId] = [];
  }
  state.clusterFiles[clusterId].push(file);

  if (cluster) {
    cluster.fileCount = state.clusterFiles[clusterId].length;
  }

  pushUpdate(state, {
    actor: normalizeActorName(actor),
    action: `上传文件至《${cluster?.name ?? clusterId}》`,
    type: "file",
    now,
  });

  saveState(state);
  return { ...file };
}

export function deleteClusterFile(clusterId: string, fileId: string, actor?: string): boolean {
  const state = getState();
  const files = state.clusterFiles[clusterId] ?? [];
  const idx = files.findIndex((f) => f.id === fileId);
  if (idx < 0) return false;

  const [file] = files.splice(idx, 1);
  const cluster = state.clusters.find((c) => c.id === clusterId);
  if (cluster) {
    cluster.fileCount = files.length;
  }

  pushUpdate(state, {
    actor: normalizeActorName(actor),
    action: `删除文件《${file.name}》`,
    type: "file",
    now: new Date(),
  });

  saveState(state);
  return true;
}

export function getUpdateLog(): DatabaseUpdate[] {
  const state = getState();
  return state.updateLog.map((u) => ({ ...u }));
}

export function debugResetDatabaseStore() {
  cache = buildSeedState();
  saveState(cache);
  return cloneState(cache);
}

/**
 * Restore a specific cluster from seed blueprints if it doesn't exist.
 * Useful for recovering accidentally deleted seed clusters like "民法学".
 */
export function restoreCluster(clusterId: string, actor?: string): Cluster | null {
  const state = getState();

  // Check if cluster already exists
  if (state.clusters.some((c) => c.id === clusterId)) {
    return null; // Already exists, nothing to restore
  }

  const catalog = REBUILT_CLUSTER_CATALOG.find((item) => item.id === clusterId);
  if (!catalog) {
    return null; // Unknown cluster ID
  }

  const seedState = buildSeedState();
  const seedFiles = (seedState.clusterFiles[clusterId] ?? []).map((file) => ({ ...file }));

  const now = new Date();

  // Create cluster
  const cluster: Cluster = {
    id: catalog.id,
    name: catalog.name,
    fileCount: seedFiles.length,
    createdAt: catalog.createdAt,
  };

  state.clusters.push(cluster);
  state.clusterFiles[catalog.id] = seedFiles;

  // Add update log entry
  state.updateLog.unshift({
    id: `restore-${Date.now()}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    date: formatDateForTimeline(now),
    actor: normalizeActorName(actor),
    action: `恢复聚类《${catalog.name}》`,
    type: "cluster",
    timestamp: now.getTime(),
  });

  saveState(state);
  cache = state;
  return cluster;
}
