"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coerceClientError } from "../../shared/error-utils";

const VIS_SCRIPT_SRC = "/trace/lib/vis-9.1.2/vis-network.min.js";
const VIS_STYLE_HREF = "/trace/lib/vis-9.1.2/vis-network.css";
const TRACE_GRAPH_DATA_MANIFEST_URL = "/trace/trace-knowledge-graph-manifest.json";
const TRACE_GRAPH_DATA_FALLBACK_URL = "/trace/trace-knowledge-graph-reduced.json";
const TRACE_NODE_COLOR_PALETTE = [
  "#A7AAE1",
  "#2FA4D7",
  "#9ED3DC",
  "#FEFD99",
  "#FCB7C7",
  "#CA6180",
] as const;

interface TraceNodeColorState {
  background: string;
  border: string;
}

interface TraceNodeColorSpec {
  background: string;
  border: string;
  highlight: TraceNodeColorState;
  hover: TraceNodeColorState;
}

function resolveTraceNodeColor(node: Pick<TraceGraphNode, "id">): TraceNodeColorSpec {
  const key = node.id;
  const seed = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const base = TRACE_NODE_COLOR_PALETTE[seed % TRACE_NODE_COLOR_PALETTE.length];
  return {
    background: base,
    border: base,
    highlight: {
      background: base,
      border: base,
    },
    hover: {
      background: base,
      border: base,
    },
  };
}

type GraphStatus = "loading" | "ready" | "error";

interface TraceGraphNode {
  id: string;
  label: string;
  title: string;
  group?: string;
  color?: string | TraceNodeColorSpec;
  shape: string;
  size: number;
  borderWidth?: number;
}

interface TraceGraphEdge {
  from: string;
  to: string;
  width: number;
  title: string;
  smooth: boolean;
  color: string;
}

interface TraceGraphMeta {
  generatedAt: string;
  sourceKind?: string;
  sourcePath?: string;
  sourceNodeCount: number;
  sourceEdgeCount: number;
  keptNodeCount: number;
  keptEdgeCount: number;
  targetNodeCount?: number;
  targetRatio?: number;
  sourceGraphBytes: number;
  centerRoots: string[];
  translationMode?: string;
}

interface TraceGraphPayload {
  meta: TraceGraphMeta;
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
}

interface TraceGraphManifest {
  activeDataUrl?: string;
}

interface VisNetworkInstance {
  destroy: () => void;
  fit: (options?: unknown) => void;
  on: (event: string, handler: (params: { nodes: string[] }) => void) => void;
  once: (event: string, handler: () => void) => void;
  setOptions: (options: unknown) => void;
}

interface VisNamespace {
  Network: new (
    container: HTMLElement,
    data: { nodes: TraceGraphNode[]; edges: TraceGraphEdge[] },
    options: Record<string, unknown>,
  ) => VisNetworkInstance;
}

declare global {
  interface Window {
    vis?: VisNamespace;
  }
}

let visScriptPromise: Promise<void> | null = null;

function ensureVisStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-trace-vis="${VIS_STYLE_HREF}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = VIS_STYLE_HREF;
  link.dataset.traceVis = VIS_STYLE_HREF;
  document.head.appendChild(link);
}

function loadVisScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is not available"));
  }
  if (window.vis?.Network) {
    return Promise.resolve();
  }
  if (visScriptPromise) return visScriptPromise;

  visScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-trace-vis="${VIS_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.vis?.Network) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        (event) => {
          visScriptPromise = null;
          reject(coerceClientError(event, "vis-network 脚本加载失败"));
        },
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = VIS_SCRIPT_SRC;
    script.async = true;
    script.dataset.traceVis = VIS_SCRIPT_SRC;
    script.onload = () => {
      if (window.vis?.Network) {
        resolve();
        return;
      }
      visScriptPromise = null;
      reject(new Error("vis-network 脚本加载完成但未初始化 Network"));
    };
    script.onerror = (event) => {
      visScriptPromise = null;
      reject(coerceClientError(event, "vis-network 脚本加载失败"));
    };
    document.body.appendChild(script);
  });

  return visScriptPromise;
}

export interface TraceKnowledgeGraphProps {
  onExit?: () => void;
}

export function TraceKnowledgeGraph({ onExit }: TraceKnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<VisNetworkInstance | null>(null);

  const [status, setStatus] = useState<GraphStatus>("loading");
  const [errorText, setErrorText] = useState<string>("");
  const [meta, setMeta] = useState<TraceGraphMeta | null>(null);

  const summaryText = "可放大图谱查看详细内容";

  const bottomNodeCountText = useMemo(() => {
    if (!meta) return "节点数：读取中";
    return `节点数：${meta.keptNodeCount}`;
  }, [meta]);

  const bottomEdgeCountText = useMemo(() => {
    if (!meta) return "边数：读取中";
    return `边数：${meta.keptEdgeCount}`;
  }, [meta]);

  const bottomKeywordsText = useMemo(() => {
    const centerRoots = meta?.centerRoots ?? [];
    if (!centerRoots.length) return "中心关键词：读取中";
    return `中心关键词：${centerRoots.join("、")}`;
  }, [meta]);

  const handleFit = useCallback(() => {
    networkRef.current?.fit({
      animation: {
        duration: 420,
        easingFunction: "easeInOutQuad",
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function mountGraph() {
      try {
        setStatus("loading");
        setErrorText("");

        ensureVisStylesheet();
        await loadVisScript();

        let dataUrl = TRACE_GRAPH_DATA_FALLBACK_URL;
        try {
          const manifestResponse = await fetch(TRACE_GRAPH_DATA_MANIFEST_URL, { cache: "no-store" });
          if (manifestResponse.ok) {
            const manifest = (await manifestResponse.json()) as TraceGraphManifest;
            if (manifest.activeDataUrl) {
              dataUrl = manifest.activeDataUrl;
            }
          }
        } catch {
          dataUrl = TRACE_GRAPH_DATA_FALLBACK_URL;
        }

        const response = await fetch(dataUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`图谱数据加载失败（HTTP ${response.status}）`);
        }

        const payload = (await response.json()) as TraceGraphPayload;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) {
          throw new Error("图谱容器不存在");
        }

        const vis = window.vis;
        if (!vis?.Network) {
          throw new Error("vis-network 初始化失败");
        }

        const options: Record<string, unknown> = {
          autoResize: true,
          layout: {
            improvedLayout: true,
            randomSeed: 23,
          },
          groups: {},
          interaction: {
            dragNodes: true,
            dragView: true,
            zoomView: true,
            hover: true,
            hoverConnectedEdges: false,
            hideEdgesOnDrag: false,
            hideNodesOnDrag: false,
            tooltipDelay: 80,
            navigationButtons: false,
            keyboard: false,
          },
          nodes: {
            borderWidth: 1,
            borderWidthSelected: 2,
            chosen: false,
            font: {
              face: "DingTalk JinBuTi, sans-serif",
              color: "#0f172a",
              size: 12,
            },
            scaling: {
              min: 9,
              max: 34,
            },
          },
          edges: {
            color: {
              color: "rgba(0,71,255,0.32)",
              highlight: "rgba(0,71,255,0.78)",
              hover: "rgba(0,71,255,0.62)",
            },
            smooth: {
              enabled: false,
            },
          },
          physics: {
            enabled: true,
            solver: "barnesHut",
            barnesHut: {
              gravitationalConstant: -2200,
              centralGravity: 0.38,
              springLength: 130,
              springConstant: 0.05,
              damping: 0.22,
              avoidOverlap: 0.18,
            },
            adaptiveTimestep: true,
            stabilization: {
              enabled: true,
              iterations: 320,
              fit: true,
              updateInterval: 40,
            },
          },
        };

        const normalizedNodes = payload.nodes.map((node) => {
          const color = resolveTraceNodeColor(node);
          return {
            id: node.id,
            label: node.label,
            title: node.title,
            shape: node.shape,
            size: node.size,
            borderWidth: node.borderWidth,
            color,
          };
        });

        networkRef.current?.destroy();
        const network = new vis.Network(
          container,
          {
            nodes: normalizedNodes,
            edges: payload.edges,
          },
          options,
        );
        networkRef.current = network;

        network.setOptions({
          interaction: {
            hideEdgesOnDrag: false,
            hideNodesOnDrag: false,
          },
          edges: {
            smooth: {
              enabled: false,
            },
          },
        });

        network.on("dragStart", () => {
          network.setOptions({
            interaction: {
              hideEdgesOnDrag: false,
              hideNodesOnDrag: false,
            },
          });
        });

        network.once("stabilizationIterationsDone", () => {
          network.setOptions({
            physics: {
              stabilization: false,
            },
          });
        });

        setMeta(payload.meta);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        const message = coerceClientError(error, "图谱初始化失败").message;
        setErrorText(message);
        setStatus("error");
      }
    }

    mountGraph();

    return () => {
      cancelled = true;
      networkRef.current?.destroy();
      networkRef.current = null;
    };
  }, []);

  return (
    <div className="trace-graph-shell" aria-label="知识图谱视图">
      <header className="trace-graph-header">
        <div className="trace-graph-title-group">
          <h2 className="trace-graph-title">知识图谱</h2>
          <p className="trace-graph-summary">{summaryText}</p>
        </div>
        <button
          type="button"
          className="trace-graph-reset-btn"
          onClick={handleFit}
          disabled={status !== "ready"}
        >
          重置视图
        </button>
      </header>

      <div className="trace-graph-stage-wrap">
        <div ref={containerRef} className="trace-graph-stage" />

        {status === "loading" && (
          <div className="trace-graph-mask" role="status" aria-live="polite">
            图谱加载中…
          </div>
        )}

        {status === "error" && (
          <div className="trace-graph-mask trace-graph-mask--error" role="alert">
            {errorText || "图谱加载失败"}
          </div>
        )}
      </div>

      <footer className="trace-graph-footer">
        <p className="trace-graph-center-roots">{bottomNodeCountText}</p>
        <p className="trace-graph-center-roots">{bottomEdgeCountText}</p>
        <p className="trace-graph-center-roots">{bottomKeywordsText}</p>
      </footer>

      <div className="trace-graph-exit-wrap">
        <button
          type="button"
          className="trace-graph-exit-btn"
          onClick={onExit}
          aria-label="退出知识溯源页面"
        >
          退出页面
        </button>
      </div>
    </div>
  );
}
