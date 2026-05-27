"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { createPortal } from "react-dom";
import { LINE_DRAW_EASE } from "../../shared/animation";
import {
  MAIN_CANVAS_EXPANDED,
  MAIN_CANVAS_EXTRA_LINE_EXPANDED_X,
  MAIN_CANVAS_MENU_OPEN,
  VW,
  svgToCssPx,
  svgShiftPx,
} from "../../shared/coords";
import { ModelConfigCanvasLines } from "./ModelConfigCanvasLines";
import { useAppRuntime, type RuntimeModelConfigState } from "@/app/components/runtime/AppRuntimeProvider";
import type { TraceEvidence } from "./TraceWindow";
import { adminSubmitRequest } from "@/app/lib/client/admin-adapter";
import type {
  ChatConversationSummary,
  ChatConversationDetail,
  CreateConversationResponse,
  ListConversationsResponse,
} from "@/app/lib/chat-history-contract";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { askFederationChat, FederationChatError } from "../services/federation-chat-api";
import { askNodeRetrieve, NodeRetrieveError } from "../services/node-retrieve-api";
import { coerceClientError } from "../../shared/error-utils";
import { ChatHistoryGroup } from "./ChatHistoryGroup";


// ─── BotBubble ────────────────────────────────────────────────────────────────
interface BotBubbleProps {
  msgId: string;
  content: string;
  evidence: TraceEvidence[] | null;
  showTrace: boolean;
  onTrace: (msgId: string, content: string, evidence: TraceEvidence[]) => void;
}

function buildMCGroupStateMapFromRuntime(
  state: RuntimeModelConfigState | undefined,
  initialJudgeConfigured: boolean,
): MCGroupStateMap {
  const fallback = createDefaultMCGroupStateMap(initialJudgeConfigured);
  if (!state) return fallback;

  const groupIds: MCGroupId[] = ["local_query", "embedding", "rerank", "judge"];
  return groupIds.reduce((acc, groupId) => {
    const group = state[groupId];
    const fallbackGroup = fallback[groupId];
    acc[groupId] = {
      ...fallbackGroup,
      provider: group.provider,
      model: group.model,
      baseUrl: group.baseUrl,
      apiKey: group.apiKey,
      modelPath: group.modelPath,
      localUrl: group.localUrl,
      isConfigured: group.isConfigured,
      connectError: "",
      connectSuccess: group.isConfigured,
      isConnecting: false,
    };
    return acc;
  }, {} as MCGroupStateMap);
}

function BotBubble({ msgId, content, evidence, showTrace, onTrace }: BotBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const btnOuterRef = useRef<HTMLDivElement>(null);
  const btnInnerRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    if (!showTrace) return;

    const bubble = bubbleRef.current;
    const btnOuter = btnOuterRef.current;
    const btnInner = btnInnerRef.current;
    if (!bubble || !btnOuter || !btnInner) return;

    gsap.set(btnOuter, { width: 0 });
    gsap.set(btnInner, { opacity: 0 });

    const targetTraceWidth = TRACE_BUTTON_FIXED_WIDTH;

    const tl = gsap.timeline({ paused: true });

    tl.to(btnOuter, {
      width: targetTraceWidth,
      duration: 0.38,
      ease: LINE_DRAW_EASE,
    }, 0.14);

    tl.to(btnInner, {
      opacity: 1,
      duration: 0.18,
      ease: "power2.out",
    }, 0.38);

    tlRef.current = tl;

    const onEnter = () => tlRef.current?.play(0);
    const onLeave = () => tlRef.current?.reverse();
    bubble.addEventListener("mouseenter", onEnter);
    bubble.addEventListener("mouseleave", onLeave);

    return () => {
      bubble.removeEventListener("mouseenter", onEnter);
      bubble.removeEventListener("mouseleave", onLeave);
      tl.kill();
      tlRef.current = null;
    };
  }, [showTrace]);

  if (!showTrace) {
    return <div className="chat-bubble chat-bubble--bot">{content}</div>;
  }

  return (
    <div ref={bubbleRef} className="chat-bubble chat-bubble--bot chat-bubble--bot-traceable">
      {content}
      <div ref={btnOuterRef} className="trace-btn-outer" aria-hidden="true">
        <div
          ref={btnInnerRef}
          className="trace-btn-inner"
          role="button"
          tabIndex={0}
          aria-label="查看回答溯源"
          onClick={() => {
            if (!evidence) return;
            onTrace(msgId, content, evidence);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !evidence) return;
            onTrace(msgId, content, evidence);
          }}
        >
          溯源
        </div>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "local" | "global";
type MessageRole = "user" | "bot" | "typing";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  evidence?: TraceEvidence[];
}

// 模型配置状态机
type MCPhase = "closed" | "opening" | "opened" | "fading_out" | "closing_canvas";
type MCProvider = "OpenAI" | "Ollama" | "Local";
type MCGroupId = "local_query" | "judge" | "embedding" | "rerank";

const MC_MODEL_OPTIONS: Record<MCProvider, string[]> = {
  OpenAI: ["gpt", "qwen", "deepseek"],
  Ollama: ["llama", "deepseek", "gemma", "qwen"],
  Local: ["Auto", "llama", "gemma", "qwen"],
};

interface MCGroupState {
  provider: MCProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  modelPath: string;
  localUrl: string;
  connectError: string;
  connectSuccess: boolean;
  isConnecting: boolean;
  isConfigured: boolean;
}

type MCGroupStateMap = Record<MCGroupId, MCGroupState>;

const MC_GROUP_DEFS: ReadonlyArray<{ id: MCGroupId; title: string }> = [
  { id: "local_query", title: "本地查询模型" },
  { id: "embedding", title: "嵌入模型" },
  { id: "rerank", title: "重排模型" },
  { id: "judge", title: "法官模型" },
];

function createDefaultMCGroupState(): MCGroupState {
  return {
    provider: "OpenAI",
    model: MC_MODEL_OPTIONS.OpenAI[0],
    baseUrl: "",
    apiKey: "",
    modelPath: "",
    localUrl: "",
    connectError: "",
    connectSuccess: false,
    isConnecting: false,
    isConfigured: false,
  };
}

function isSameMCGroupStateMap(prev: MCGroupStateMap, next: MCGroupStateMap): boolean {
  const groupIds: MCGroupId[] = ["local_query", "embedding", "rerank", "judge"];
  return groupIds.every((id) => {
    const prevGroup = prev[id];
    const nextGroup = next[id];
    return (
      prevGroup.provider === nextGroup.provider &&
      prevGroup.model === nextGroup.model &&
      prevGroup.baseUrl === nextGroup.baseUrl &&
      prevGroup.apiKey === nextGroup.apiKey &&
      prevGroup.modelPath === nextGroup.modelPath &&
      prevGroup.localUrl === nextGroup.localUrl &&
      prevGroup.isConfigured === nextGroup.isConfigured &&
      prevGroup.connectError === nextGroup.connectError &&
      prevGroup.connectSuccess === nextGroup.connectSuccess &&
      prevGroup.isConnecting === nextGroup.isConnecting
    );
  });
}

async function extractErrorMessageFromResponse(response: Response, fallbackMessage: string): Promise<string> {
  const fallbackWithStatus = `${fallbackMessage}（HTTP ${response.status}）`;
  try {
    const payload: unknown = await response.json();
    if (
      payload
      && typeof payload === "object"
      && "error" in payload
      && typeof (payload as { error?: unknown }).error === "string"
      && (payload as { error: string }).error.trim()
    ) {
      return (payload as { error: string }).error;
    }
    return fallbackWithStatus;
  } catch {
    return fallbackWithStatus;
  }
}

function createDefaultMCGroupStateMap(initialJudgeConfigured = false): MCGroupStateMap {
  return {
    local_query: createDefaultMCGroupState(),
    judge: {
      ...createDefaultMCGroupState(),
      isConfigured: initialJudgeConfigured,
      connectSuccess: initialJudgeConfigured,
    },
    embedding: createDefaultMCGroupState(),
    rerank: createDefaultMCGroupState(),
  };
}

function validateMCGroup(group: MCGroupState): string | null {
  if (group.provider !== "Local") {
    if (!group.baseUrl.trim()) return "接口地址不能为空";
    if (!group.apiKey.trim()) return "API Key 不能为空";
    try { new URL(group.baseUrl); } catch {
      return "接口地址格式不正确，请输入完整 URL";
    }
    return null;
  }

  if (!group.modelPath.trim()) return "请指定模型路径";
  if (group.localUrl.trim()) {
    try { new URL(group.localUrl); } catch {
      return "服务端口格式不正确，请输入完整 URL";
    }
  }
  return null;
}

function buildMCPayload(group: MCGroupState) {
  if (group.provider !== "Local") {
    return {
      provider: group.provider,
      model: group.model,
      baseUrl: group.baseUrl,
      apiKey: group.apiKey,
    };
  }

  return {
    provider: group.provider,
    model: group.model,
    modelPath: group.modelPath,
    localUrl: group.localUrl || "http://localhost:8000/v1",
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPING_STAGE_STATIC_DELAY_MS = 550;
const THINKING_TOTAL_DELAY_MS_BY_MODE: Record<Mode, number> = {
  local: 5000,
  global: 15000,
};
const TRACE_BUTTON_FIXED_WIDTH = 96;
const BOT_STREAM_INTERVAL_MS = 26;
const BOT_STREAM_CHUNK_SIZE = 2;
const EMPTY_INPUT_CENTER_LIFT_EXTRA_PX = 58;
const EMPTY_INPUT_WIDTH_RATIO = 0.9;
const EMPTY_INPUT_MIN_WIDTH_PX = 420;

function buildFederationReplyText(result: Awaited<ReturnType<typeof askFederationChat>>): string {
  const statusPrefix =
    result.status === "partial"
      ? "[部分节点失败，已返回可用结果]"
      : result.status === "error"
        ? "[链路异常]"
        : "";

  const detailsText = result.details
    .map((item) => {
      const parts: string[] = [`节点:${item.node}`, `状态:${item.status}`];
      if (typeof item.confidence === "number") {
        parts.push(`置信度:${item.confidence.toFixed(2)}`);
      }
      if (item.answer_preview) {
        parts.push(`摘要:${item.answer_preview}`);
      }
      if (item.detail) {
        parts.push(`错误:${item.detail}`);
      }
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");

  const sections = [
    statusPrefix,
    result.answer,
    detailsText ? `节点明细:\n${detailsText}` : "",
    `请求ID: ${result.requestId}`,
  ].filter(Boolean);

  return sections.join("\n\n");
}

function buildFederationErrorReply(error: unknown): string {
  if (error instanceof FederationChatError) {
    const req = error.requestId ? `\n请求ID: ${error.requestId}` : "";
    return `检索失败：${error.message}${req}`;
  }

  if (error instanceof Error) {
    return `检索失败：${error.message}`;
  }

  return "检索失败：未知异常";
}

function buildNodeRetrieveErrorReply(error: unknown): string {
  if (error instanceof NodeRetrieveError) {
    const req = error.requestId ? `\n请求ID: ${error.requestId}` : "";
    return `本地检索失败：${error.message}${req}`;
  }

  if (error instanceof Error) {
    return `本地检索失败：${error.message}`;
  }

  return "本地检索失败：未知异常";
}

function formatConversationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface ChatInteractionPanelProps {
  menuOpen?: boolean;
  canvasReady?: boolean;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
  onOpenTrace?: (msgId: string, content: string, evidence: TraceEvidence[]) => void;
  initialJudgeModelConfigured?: boolean;
  onJudgeModelConfiguredChange?: (configured: boolean) => void;
  initialModelConfigState?: RuntimeModelConfigState;
  onModelConfigStateChange?: (state: RuntimeModelConfigState) => void;
  isSelfCenterNode?: boolean;
}

export function ChatInteractionPanel({
  menuOpen = false,
  canvasReady = false,
  mode = "local",
  onModeChange,
  onOpenTrace,
  initialJudgeModelConfigured = false,
  onJudgeModelConfiguredChange,
  initialModelConfigState,
  onModelConfigStateChange,
  isSelfCenterNode = false,
}: ChatInteractionPanelProps) {
  const { username } = useAppRuntime();

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatVisualState, setChatVisualState] = useState<'empty_centered' | 'active_bottom'>('empty_centered');
  const [historyLoadingConvId, setHistoryLoadingConvId] = useState<string | null>(null);
  const [mcToast, setMCToast] = useState("");

  // ── Chat history state ────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [deleteTargetConv, setDeleteTargetConv] = useState<ChatConversationSummary | null>(null);
  const [isDeletingConv, setIsDeletingConv] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  // ── Model config state ──────────────────────────────────────────────────────
  const [mcPhase, setMCPhase] = useState<MCPhase>("closed");
  const [mcGroups, setMCGroups] = useState<MCGroupStateMap>(() =>
    buildMCGroupStateMapFromRuntime(initialModelConfigState, initialJudgeModelConfigured),
  );
  const [mcSaveSummary, setMCSaveSummary] = useState("");
  const [mcSaveSummaryTone, setMCSaveSummaryTone] = useState<"" | "success" | "warning">("");

  // Derived
  const mcMounted = mcPhase !== "closed";
  const mcCanvasOpen = mcPhase === "opening" || mcPhase === "opened" || mcPhase === "fading_out";
  const mcCloseVisible = mcPhase === "opened" || mcPhase === "fading_out";
  const mcAnyConnecting = MC_GROUP_DEFS.some(({ id }) => mcGroups[id].isConnecting);

  // ── Chat refs ───────────────────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef(false);
  const pendingEntryIdsRef = useRef<Set<string>>(new Set());
  const bubbleTweensRef = useRef<Map<string, gsap.core.Tween>>(new Map());
  const typingTimerRef = useRef<number | null>(null);
  const botReplyTimerRef = useRef<number | null>(null);
  const streamTimerRef = useRef<number | null>(null);

  const modeRowRef = useRef<HTMLDivElement>(null);
  const msgMaskRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const revealTlRef = useRef<gsap.core.Timeline | null>(null);
  const toBottomTlRef = useRef<gsap.core.Timeline | null>(null);
  const toCenterTlRef = useRef<gsap.core.Timeline | null>(null);
  const promptCharsTweenRef = useRef<gsap.core.Tween | null>(null);
  const chatVisualStateRef = useRef<'empty_centered' | 'active_bottom'>('empty_centered');
  const promptTextRef = useRef<HTMLDivElement>(null);
  const inputInnerRef = useRef<HTMLDivElement>(null);
  const loadConvTokenRef = useRef(0);

  // ── Model config refs ───────────────────────────────────────────────────────
  const mcPanelLayerRef = useRef<HTMLDivElement>(null);
  const mcPanelRef = useRef<HTMLDivElement>(null);
  const mcHeaderRef = useRef<HTMLDivElement>(null);
  const mcFieldsRef = useRef<HTMLDivElement>(null);
  const mcFooterRef = useRef<HTMLDivElement>(null);
  const mcRevealTlRef = useRef<gsap.core.Timeline | null>(null);

  // ── Layout sync: 坐标驱动定位 ─────────────────────────────────────────────
  // 根层引用（用于写入 CSS 变量 --w4-canvas-left / --w4-canvas-right）
  const layerRef = useRef<HTMLDivElement>(null);
  // 容器实际 CSS 尺寸缓存（ResizeObserver 更新）
  const containerSizeRef = useRef({ w: 0, h: 0 });
  const fileInputRefs = useRef<Record<MCGroupId, HTMLInputElement | null>>({
    local_query: null,
    judge: null,
    embedding: null,
    rerank: null,
  });
  const prevModeRef = useRef<Mode>(mode);
  const messagesRef = useRef<Message[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>(mode);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const historyGroupsRef = useRef<HTMLDivElement>(null);
  const flipStateBeforeRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const skipNextModePersistRef = useRef(false);

  const toRuntimeModelConfigState = useCallback((groups: MCGroupStateMap): RuntimeModelConfigState => ({
    local_query: {
      provider: groups.local_query.provider,
      model: groups.local_query.model,
      baseUrl: groups.local_query.baseUrl,
      apiKey: groups.local_query.apiKey,
      modelPath: groups.local_query.modelPath,
      localUrl: groups.local_query.localUrl,
      isConfigured: groups.local_query.isConfigured,
    },
    embedding: {
      provider: groups.embedding.provider,
      model: groups.embedding.model,
      baseUrl: groups.embedding.baseUrl,
      apiKey: groups.embedding.apiKey,
      modelPath: groups.embedding.modelPath,
      localUrl: groups.embedding.localUrl,
      isConfigured: groups.embedding.isConfigured,
    },
    rerank: {
      provider: groups.rerank.provider,
      model: groups.rerank.model,
      baseUrl: groups.rerank.baseUrl,
      apiKey: groups.rerank.apiKey,
      modelPath: groups.rerank.modelPath,
      localUrl: groups.rerank.localUrl,
      isConfigured: groups.rerank.isConfigured,
    },
    judge: {
      provider: groups.judge.provider,
      model: groups.judge.model,
      baseUrl: groups.judge.baseUrl,
      apiKey: groups.judge.apiKey,
      modelPath: groups.judge.modelPath,
      localUrl: groups.judge.localUrl,
      isConfigured: groups.judge.isConfigured,
    },
  }), []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const requestChatHistoryJson = useCallback(async <T,>(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fallbackMessage: string,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      throw coerceClientError(error, `${fallbackMessage}（网络异常）`);
    }

    if (!response.ok) {
      const message = await extractErrorMessageFromResponse(response, fallbackMessage);
      throw new Error(message);
    }

    try {
      return await response.json() as T;
    } catch (error) {
      throw coerceClientError(error, `${fallbackMessage}（响应解析失败）`);
    }
  }, []);

  // 在 setConversations 之前调用：捕获列表当前布局，供 Flip 动画使用
  const captureFlipState = useCallback(() => {
    const groups = historyGroupsRef.current;
    if (!groups) return;
    flipStateBeforeRef.current = Flip.getState(
      groups.querySelectorAll(".chat-history-group-title, .chat-history-empty, .chat-history-anim-item"),
      { props: "opacity,transform" },
    );
  }, []);

  const fetchConversations = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setHistoryLoading(true);
    }
    try {
      const account = username.trim() || "default";
      const data = await requestChatHistoryJson<ListConversationsResponse>(
        `/api/chat-history?account=${encodeURIComponent(account)}`,
        undefined,
        "加载历史会话失败",
      );
      captureFlipState(); // 捕获更新前布局，供 Flip 动画使用
      setConversations(data.conversations);
      setHistoryError("");
    } catch (error) {
      const message = coerceClientError(error, "加载历史会话失败").message;
      setHistoryError(message);
      setMCToast(message);
    } finally {
      if (!options?.silent) {
        setHistoryLoading(false);
      }
    }
  }, [captureFlipState, requestChatHistoryJson, username]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  // ─── Chat history: FLIP layout animation ───────────────────────────────────
  // captureFlipState() が fetchConversations 内で setConversations より前に呼ばれる。
  // useLayoutEffect は React の DOM 更新後に同期実行されるため、
  // Flip.from() は「更新前の位置」→「更新後の位置」へ正しくアニメーションする。
  // （useGSAP で requestAnimationFrame を挟む旧実装は before/after が同一になるバグあり）
  useLayoutEffect(() => {
    const state = flipStateBeforeRef.current;
    flipStateBeforeRef.current = null;
    if (!state) return;

    const tween = Flip.from(state, {
      duration: 0.35,
      ease: "power3.out",
      stagger: 0,
      absolute: false,
      nested: true,
      scale: false,
      onEnter: (elements) => {
        return gsap.fromTo(
          elements,
          { autoAlpha: 0, x: -50, scale: 0.85, transformOrigin: "left center" },
          { autoAlpha: 1, x: 0, scale: 1, duration: 0.35, ease: "back.out(1.2)" },
        );
      },
      onLeave: (elements) => {
        return gsap.to(elements, {
          autoAlpha: 0, scale: 0.9, duration: 0.25, ease: "power2.in",
        });
      },
    });

    return () => { tween?.kill(); };
  }, [conversations]);

  const persistTurn = useCallback(async (
    payloadMode: Mode,
    turnMessages: Array<{ role: "user" | "bot"; content: string; evidence?: TraceEvidence[] | null }>,
  ) => {
    if (turnMessages.length === 0) return;

    const serialized = turnMessages.map((m) => ({
      role: m.role,
      content: m.content,
      evidenceJson: m.evidence?.length ? JSON.stringify(m.evidence) : null,
    }));

    if (activeConversationIdRef.current) {
      try {
        await requestChatHistoryJson<{ ok: true }>(
          `/api/chat-history/${activeConversationIdRef.current}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: serialized }),
          },
          "保存历史消息失败",
        );
        void fetchConversations({ silent: true });
        return; // 成功追加，结束
      } catch (error) {
        const msg = coerceClientError(error, "保存历史消息失败").message;
        if (msg.includes("Conversation not found")) {
          // 会话丢失（服务器重启 / Mock 重置 / Prisma P2025）
          // 重置本地 ID，降级到下方"新建会话"分支
          activeConversationIdRef.current = null;
          setActiveConversationId(null);
        } else {
          setMCToast(msg);
          return;
        }
      }
    }

    // 无活跃会话或追加失败后降级：创建新会话
    try {
      const account = username.trim() || "default";
      const data = await requestChatHistoryJson<CreateConversationResponse>(
        "/api/chat-history",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: payloadMode,
            messages: serialized,
            account,
          }),
        },
        "创建历史会话失败",
      );
      activeConversationIdRef.current = data.conversation.id;
      setActiveConversationId(data.conversation.id);
      void fetchConversations({ silent: true });
    } catch (error) {
      setMCToast(coerceClientError(error, "创建历史会话失败").message);
    }
  }, [fetchConversations, requestChatHistoryJson, username]);

  const persistCurrentConversationAsNew = useCallback(async (
    payloadMode: Mode,
    rawMessages: Message[],
  ) => {
    if (activeConversationIdRef.current) return;
    const saveable = rawMessages.filter((msg) => msg.role === "user" || msg.role === "bot");
    if (!saveable.some((msg) => msg.role === "user")) return;

    try {
      const account = username.trim() || "default";
      const data = await requestChatHistoryJson<CreateConversationResponse>(
        "/api/chat-history",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: payloadMode,
            messages: saveable.map((msg) => ({
              role: msg.role as "user" | "bot",
              content: msg.content,
            })),
            account,
          }),
        },
        "保存当前会话失败",
      );
      setActiveConversationId(data.conversation.id);
      void fetchConversations({ silent: true });
    } catch (error) {
      setMCToast(coerceClientError(error, "保存当前会话失败").message);
    }
  }, [fetchConversations, requestChatHistoryJson, username]);

  const createEmptyConversation = useCallback(async (payloadMode: Mode) => {
    try {
      const account = username.trim() || "default";
      const data = await requestChatHistoryJson<CreateConversationResponse>(
        "/api/chat-history",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: payloadMode,
            messages: [],
            account,
          }),
        },
        "新建会话失败",
      );
      setActiveConversationId(data.conversation.id);
      setHistoryError("");
      void fetchConversations({ silent: true });
      return true;
    } catch (error) {
      setActiveConversationId(null);
      setMCToast(coerceClientError(error, "新建会话失败").message);
      return false;
    }
  }, [fetchConversations, requestChatHistoryJson, username]);

  const resetChatRuntimeState = useCallback(() => {
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (botReplyTimerRef.current !== null) {
      window.clearTimeout(botReplyTimerRef.current);
      botReplyTimerRef.current = null;
    }
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    isSendingRef.current = false;
    setIsSending(false);
  }, []);

  // ─── Chat: central visual-state dispatcher ────────────────────────────────
  // Drives forward (empty→active) and reverse (active→empty) animations.
  // All trigger points (send, new-conv, load-conv, delete, mode-switch) call this.
  const applyChatVisualState = useCallback((
    target: 'empty_centered' | 'active_bottom',
    instant = false,
    options?: { animatePromptChars?: boolean },
  ) => {
    const animatePromptChars = options?.animatePromptChars ?? true;
    toBottomTlRef.current?.kill();
    toCenterTlRef.current?.kill();
    promptCharsTweenRef.current?.kill();

    const msgMask   = msgMaskRef.current;
    const inputArea = inputAreaRef.current;
    const inputInner = inputInnerRef.current;
    const prompt    = promptTextRef.current;

    if (!msgMask || !inputArea || !inputInner) return;

    chatVisualStateRef.current = target;

    const msgMaskH  = msgMask.offsetHeight;
    const centerY   = -(msgMaskH / 2) - EMPTY_INPUT_CENTER_LIFT_EXTRA_PX;
    const fullW     = inputArea.offsetWidth;
    const narrowW   = Math.max(fullW * EMPTY_INPUT_WIDTH_RATIO, EMPTY_INPUT_MIN_WIDTH_PX);
    const narrowX   = (fullW - narrowW) / 2;

    if (instant) {
      gsap.set(msgMask,   { opacity: target === 'active_bottom' ? 1 : 0 });
      gsap.set(inputArea, { y: target === 'active_bottom' ? 0 : centerY });
      gsap.set(inputInner, { width: target === 'active_bottom' ? fullW : narrowW, x: target === 'active_bottom' ? 0 : narrowX });
      if (prompt) {
        gsap.set(prompt, { opacity: target === 'active_bottom' ? 0 : 1, y: 0 });
        if (target === 'empty_centered') {
          const chars = prompt.querySelectorAll<HTMLElement>('.chat-empty-prompt-char');
          gsap.set(chars, { opacity: 1, y: 0 });
        }
      }
      setChatVisualState(target);
      return;
    }

    if (target === 'empty_centered') {
      const tl = gsap.timeline({ onComplete: () => setChatVisualState('empty_centered') });
      toCenterTlRef.current = tl;
      tl.to(msgMask,    { opacity: 0, duration: 0.28, ease: 'power2.out' }, 0);
      tl.to(inputArea,  { y: centerY, duration: 0.52, ease: 'power2.inOut' }, 0.05);
      tl.to(inputInner, { width: narrowW, x: narrowX, duration: 0.52, ease: 'power2.inOut' }, 0.05);
      if (prompt) {
        if (animatePromptChars) {
          tl.call(() => {
            gsap.set(prompt, { opacity: 1, y: 0 });
            const chars = prompt.querySelectorAll<HTMLElement>('.chat-empty-prompt-char');
            gsap.set(chars, { opacity: 0, y: 20 });
            promptCharsTweenRef.current = gsap.to(chars, {
              opacity: 1, y: 0, duration: 0.45, stagger: 0.06,
              ease: 'power3.out', force3D: true,
            });
          }, [], 0.50);
        } else {
          tl.call(() => {
            gsap.set(prompt, { opacity: 1, y: 0 });
            const chars = prompt.querySelectorAll<HTMLElement>('.chat-empty-prompt-char');
            gsap.set(chars, { opacity: 1, y: 0 });
          }, [], 0.50);
        }
      }
    } else {
      const tl = gsap.timeline({ onComplete: () => setChatVisualState('active_bottom') });
      toBottomTlRef.current = tl;
      if (prompt) tl.to(prompt, { opacity: 0, y: -6, duration: 0.18, ease: 'power2.in' }, 0);
      tl.to(inputArea,  { y: 0,     duration: 0.52, ease: 'power3.inOut' }, 0.08);
      tl.to(inputInner, { width: fullW, x: 0, duration: 0.52, ease: 'power3.inOut' }, 0.08);
      tl.to(msgMask,    { opacity: 1, duration: 0.38, ease: 'power2.out' }, 0.20);
    }
  }, []);

  const handleNewConversation = useCallback(async () => {
    resetChatRuntimeState();
    await persistCurrentConversationAsNew(modeRef.current, messagesRef.current);
    setMessages([]);
    applyChatVisualState('empty_centered');
    await createEmptyConversation(modeRef.current);
  }, [applyChatVisualState, createEmptyConversation, persistCurrentConversationAsNew, resetChatRuntimeState]);

  const handleLoadConversation = useCallback(async (conversation: ChatConversationSummary) => {
    resetChatRuntimeState();
    await persistCurrentConversationAsNew(modeRef.current, messagesRef.current);

    if (conversation.mode === "global" && !mcGroups.judge.isConfigured) {
      setMCToast("未配置法官模型，无法切换到全局历史会话");
      return;
    }

    if (conversation.mode !== modeRef.current) {
      skipNextModePersistRef.current = true;
      onModeChange?.(conversation.mode);
    }

    // Pending-UI: show loading indicator on the item; use request token to avoid stale updates
    const token = ++loadConvTokenRef.current;
    setHistoryLoadingConvId(conversation.id);

    try {
      const data = await requestChatHistoryJson<{ conversation: ChatConversationDetail }>(
        `/api/chat-history/${conversation.id}`,
        undefined,
        "加载历史会话失败",
      );
      if (token !== loadConvTokenRef.current) return;

      const loadedMessages = data.conversation.messages.map((msg) => {
        let evidence: TraceEvidence[] | undefined;
        if (msg.evidenceJson) {
          try {
            evidence = JSON.parse(msg.evidenceJson) as TraceEvidence[];
          } catch { /* ignore malformed JSON */ }
        }
        return {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          evidence,
        };
      });
      setMessages(loadedMessages);
      setActiveConversationId(conversation.id);

      // Data-driven animation: animate AFTER knowing whether the conversation is empty
      if (loadedMessages.length === 0) {
        applyChatVisualState('empty_centered');
      } else {
        applyChatVisualState('active_bottom');
      }
    } catch (error) {
      if (token !== loadConvTokenRef.current) return;
      const msg = coerceClientError(error, "加载历史会话失败").message;
      if (msg.includes("Conversation not found")) {
        setMCToast("该对话已不存在");
        captureFlipState();
        setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
      } else {
        setMCToast(msg);
      }
    } finally {
      if (token === loadConvTokenRef.current) {
        setHistoryLoadingConvId(null);
      }
    }
  }, [applyChatVisualState, captureFlipState, mcGroups.judge.isConfigured, onModeChange, persistCurrentConversationAsNew, requestChatHistoryJson, resetChatRuntimeState]);

  const handleDeleteConversation = useCallback(async () => {
    if (!deleteTargetConv) return;
    setIsDeletingConv(true);
    try {
      await requestChatHistoryJson<{ ok: true }>(
        `/api/chat-history/${deleteTargetConv.id}`,
        { method: "DELETE" },
        "删除历史会话失败",
      );

      if (activeConversationIdRef.current === deleteTargetConv.id) {
        setMessages([]);
        setActiveConversationId(null);
        applyChatVisualState('empty_centered', true);
      }
      setDeleteTargetConv(null);
      void fetchConversations({ silent: true });
    } catch (error) {
      setMCToast(coerceClientError(error, "删除历史会话失败").message);
    } finally {
      setIsDeletingConv(false);
    }
  }, [applyChatVisualState, deleteTargetConv, fetchConversations, requestChatHistoryJson]);

  const conversationsByMode = useMemo(() => ({
    local: conversations.filter((item) => item.mode === "local"),
    global: conversations.filter((item) => item.mode === "global"),
  }), [conversations]);

  useEffect(() => {
    return () => {
      const unloadMessages = messagesRef.current;
      if (
        activeConversationIdRef.current
        || !unloadMessages.some((msg) => msg.role === "user")
      ) {
        return;
      }
      const payload = {
        mode: modeRef.current,
        messages: unloadMessages
          .filter((msg) => msg.role === "user" || msg.role === "bot")
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
            evidenceJson: msg.evidence?.length ? JSON.stringify(msg.evidence) : null,
          })),
        account: username.trim() || "default",
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/chat-history", blob);
    };
  }, []);

  // ─── Layout sync: CSS 变量更新 ────────────────────────────────────────────
  // 从 MAIN_CANVAS_EXPANDED 坐标推算并写入 CSS 变量，供子元素消费
  const updateLayoutVars = useCallback((w: number, h: number) => {
    const layer = layerRef.current;
    if (!layer || w <= 0 || h <= 0) return;
    const pos = svgToCssPx(w, h, MAIN_CANVAS_EXPANDED);
    layer.style.setProperty("--w4-canvas-left",  `${pos.left}px`);
    layer.style.setProperty("--w4-canvas-right", `${pos.right}px`);
    const scale = Math.max(w / VW, h / (900));
    const offsetX = (w - VW * scale) / 2;
    const sidebarLeft = MAIN_CANVAS_EXTRA_LINE_EXPANDED_X * scale + offsetX;
    layer.style.setProperty("--w4-sidebar-left", `${sidebarLeft}px`);
  }, []);

  // ResizeObserver：容器尺寸变化时刷新 CSS 变量
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const sync = () => {
      const { width, height } = layer.getBoundingClientRect();
      containerSizeRef.current = { w: width, h: height };
      updateLayoutVars(width, height);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(layer);
    return () => ro.disconnect();
  }, [updateLayoutVars]);

  // ─── Chat: bubble entry animation ──────────────────────────────────────────
  const animateBubble = useCallback((el: HTMLElement, msgId: string) => {
    bubbleTweensRef.current.get(msgId)?.kill();
    const tween = gsap.fromTo(
      el,
      { opacity: 0, scale: 0.85, y: 24, transformOrigin: "bottom center", force3D: true },
      {
        opacity: 1, scale: 1, y: 0,
        duration: 0.5, ease: "power3.out",
        clearProps: "transform,opacity",
        onKill: () => { bubbleTweensRef.current.delete(msgId); },
        onComplete: () => { bubbleTweensRef.current.delete(msgId); },
      }
    );
    bubbleTweensRef.current.set(msgId, tween);
  }, []);

  // ─── Chat: smooth scroll ───────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gsap.killTweensOf(list);
        gsap.to(list, {
          scrollTop: list.scrollHeight,
          duration: 0.45,
          ease: "power2.out",
          overwrite: "auto",
        });
      });
    });
  }, []);

  // ─── Chat: entry animation for new bubbles ─────────────────────────────────
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || pendingEntryIdsRef.current.size === 0) return;
    const ids = pendingEntryIdsRef.current;
    list
      .querySelectorAll<HTMLElement>(".chat-bubble-wrapper[data-msg-id]")
      .forEach((el) => {
        const id = el.getAttribute("data-msg-id");
        if (id && ids.has(id)) animateBubble(el, id);
      });
    pendingEntryIdsRef.current.clear();
    scrollToBottom();
  }, [messages, animateBubble, scrollToBottom]);

  // ─── Chat: kill orphaned tweens ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      bubbleTweensRef.current.forEach((t) => t.kill());
      bubbleTweensRef.current.clear();
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (botReplyTimerRef.current !== null) {
        window.clearTimeout(botReplyTimerRef.current);
      }
      if (streamTimerRef.current !== null) {
        window.clearInterval(streamTimerRef.current);
      }
    };
  }, []);

  // ─── Chat: panel x position with menu ─────────────────────────────────────
  useEffect(() => {
    const panel = panelRef.current;
    const sidebar = sidebarRef.current;
    if (!panel) return;
    const { w, h } = containerSizeRef.current;
    const shiftPx = w > 0
      ? svgShiftPx(w, h, MAIN_CANVAS_EXPANDED, MAIN_CANVAS_MENU_OPEN).dx
      : -0.15 * (typeof window !== "undefined" ? window.innerWidth : 1440);
    gsap.to(panel, { x: menuOpen ? shiftPx : 0, duration: 0.45, ease: "power3.inOut" });
    if (sidebar) {
      gsap.to(sidebar, { x: menuOpen ? shiftPx : 0, duration: 0.45, ease: "power3.inOut" });
    }
  }, [menuOpen]);

  // ─── Model config: set initial mc-panel-layer position when mounted ────────
  // 若菜单已展开时才挂载模型配置层，立即对齐到坐标计算值（替代 -15vw 魔法值）
  useLayoutEffect(() => {
    if (!mcMounted) return;
    const layer = mcPanelLayerRef.current;
    if (!layer) return;
    if (menuOpen) {
      const { w, h } = containerSizeRef.current;
      const shiftPx = w > 0
        ? svgShiftPx(w, h, MAIN_CANVAS_EXPANDED, MAIN_CANVAS_MENU_OPEN).dx
        : -0.15 * (typeof window !== "undefined" ? window.innerWidth : 1440);
      gsap.set(layer, { x: shiftPx });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcMounted]);

  // ─── Model config: mc-panel-layer follows menu（坐标驱动，替代 -15vw 魔法值）
  useEffect(() => {
    if (!mcMounted) return;
    const layer = mcPanelLayerRef.current;
    if (!layer) return;
    const { w, h } = containerSizeRef.current;
    const shiftPx = w > 0
      ? svgShiftPx(w, h, MAIN_CANVAS_EXPANDED, MAIN_CANVAS_MENU_OPEN).dx
      : -0.15 * (typeof window !== "undefined" ? window.innerWidth : 1440);
    gsap.to(layer, { x: menuOpen ? shiftPx : 0, duration: 0.45, ease: "power3.inOut" });
  }, [menuOpen, mcMounted]);

  // ─── Chat: initial hide + reveal on canvasReady ────────────────────────────
  useLayoutEffect(() => {
    const targets = [sidebarRef.current, modeRowRef.current, msgMaskRef.current, inputAreaRef.current]
      .filter((el): el is HTMLDivElement => el !== null);
    if (targets.length === 0) return;
    gsap.set(targets, { opacity: 0, y: 24, visibility: "hidden" });
  }, []);

  useEffect(() => {
    if (!canvasReady) return;
    revealTlRef.current?.kill();
    const tl = gsap.timeline();
    revealTlRef.current = tl;

    const isEmpty = chatVisualStateRef.current === 'empty_centered';

    if (isEmpty) {
      // Empty state: reveal sidebar + modeRow + inputArea at centered position; keep msgMask hidden
      const msgMask   = msgMaskRef.current;
      const inputArea = inputAreaRef.current;
      const inputInner = inputInnerRef.current;
      const prompt    = promptTextRef.current;

      const msgMaskH = msgMask?.offsetHeight ?? 0;
      const centerY  = -(msgMaskH / 2) - EMPTY_INPUT_CENTER_LIFT_EXTRA_PX;
      const fullW    = inputArea?.offsetWidth ?? 0;
      const narrowW  = Math.max(fullW * EMPTY_INPUT_WIDTH_RATIO, EMPTY_INPUT_MIN_WIDTH_PX);
      const narrowX  = (fullW - narrowW) / 2;

      // msgMask stays invisible but takes up space for layout math
      if (msgMask) gsap.set(msgMask, { visibility: "visible", opacity: 0 });

      // Pre-set inputInner to narrow+centered (no animation on this sub-element at reveal)
      if (inputInner) gsap.set(inputInner, { width: narrowW, x: narrowX });

      // Pre-set prompt container hidden; chars animated individually on entry
      if (prompt) gsap.set(prompt, { opacity: 0, y: 0 });

      const emptySections = [
        { el: sidebarRef.current, at: 0.1,  fromY: 20, fromBlur: 6, toY: 0,       duration: 0.52, ease: "power3.out"    },
        { el: modeRowRef.current, at: 0.12, fromY: 16, fromBlur: 5, toY: 0,       duration: 0.50, ease: "power3.out"    },
        { el: inputArea,          at: 0.46, fromY: centerY + 38, fromBlur: 8, toY: centerY, duration: 0.68, ease: "back.out(1.4)" },
      ];

      for (const { el, at, fromY, fromBlur, toY, duration, ease } of emptySections) {
        if (!el) continue;
        gsap.set(el, { visibility: "visible" });
        tl.fromTo(
          el,
          { opacity: 0, y: fromY, filter: `blur(${fromBlur}px)` },
          { opacity: 1, y: toY, filter: "blur(0px)", duration, ease, clearProps: "filter" },
          at,
        );
      }

      // Animate prompt chars after inputArea settles
      if (prompt) {
        tl.call(() => {
          gsap.set(prompt, { opacity: 1, y: 0 });
          const chars = prompt.querySelectorAll<HTMLElement>('.chat-empty-prompt-char');
          gsap.set(chars, { opacity: 0, y: 20 });
          promptCharsTweenRef.current = gsap.to(chars, {
            opacity: 1, y: 0, duration: 0.45, stagger: 0.06,
            ease: 'power3.out', force3D: true,
          });
        }, [], 0.46 + 0.68 + 0.05);
      }
    } else {
      // Active state: original 4-element reveal
      const sections = [
        { el: sidebarRef.current,    at: 0.1,  fromY: 20, fromBlur: 6, duration: 0.52, ease: "power3.out"    },
        { el: modeRowRef.current,    at: 0.12, fromY: 16, fromBlur: 5, duration: 0.50, ease: "power3.out"    },
        { el: msgMaskRef.current,    at: 0.30, fromY: 28, fromBlur: 3, duration: 0.62, ease: "power3.out"    },
        { el: inputAreaRef.current,  at: 0.50, fromY: 38, fromBlur: 8, duration: 0.68, ease: "back.out(1.4)" },
      ];

      for (const { el, at, fromY, fromBlur, duration, ease } of sections) {
        if (!el) continue;
        gsap.set(el, { visibility: "visible" });
        tl.fromTo(
          el,
          { opacity: 0, y: fromY, filter: `blur(${fromBlur}px)` },
          { opacity: 1, y: 0, filter: "blur(0px)", duration, ease, clearProps: "filter" },
          at,
        );
      }
    }

    return () => { tl.kill(); revealTlRef.current = null; };
  }, [canvasReady]);

  useEffect(() => {
    if (!mcToast) return;
    const timer = setTimeout(() => setMCToast(""), 2200);
    return () => clearTimeout(timer);
  }, [mcToast]);

  useEffect(() => {
    if (prevModeRef.current === mode) return;
    const previousMode = prevModeRef.current;
    prevModeRef.current = mode;

    if (skipNextModePersistRef.current) {
      skipNextModePersistRef.current = false;
      return;
    }

    void (async () => {
      resetChatRuntimeState();
      await persistCurrentConversationAsNew(previousMode, messagesRef.current);
      setMessages([]);
      setActiveConversationId(null);
      applyChatVisualState('empty_centered', false, { animatePromptChars: false });
    })();
  }, [applyChatVisualState, mode, persistCurrentConversationAsNew, resetChatRuntimeState]);

  const pushValidationReply = useCallback((question: string, validationMessage: string, currentMode: Mode) => {
    const now = Date.now();
    const userId = `msg-${now}-user`;
    const botId = `msg-${now + 1}-bot`;

    pendingEntryIdsRef.current.add(userId);
    pendingEntryIdsRef.current.add(botId);
    setInputValue("");
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: question },
      { id: botId, role: "bot", content: validationMessage },
    ]);
    void persistTurn(currentMode, [
      { role: "user", content: question },
      { role: "bot", content: validationMessage },
    ]);
  }, [persistTurn]);

  const getRetrieveValidationMessage = useCallback((currentMode: Mode): string | null => {
    if (!mcGroups.local_query.isConfigured) {
      return "未配置本地查询模型，无法进行本地检索";
    }

    const missingEmbedding = !mcGroups.embedding.isConfigured;
    const missingRerank = !mcGroups.rerank.isConfigured;

    if (missingEmbedding && missingRerank) {
      return "未配置嵌入和重排模型，无法生成回复";
    }
    if (missingRerank) {
      return "未配置重排模型，无法生成回复";
    }
    if (missingEmbedding) {
      return "未配置嵌入模型，无法生成回复";
    }

    if (currentMode === "global" && !mcGroups.judge.isConfigured) {
      return "未配置法官模型，无法进行全局检索";
    }

    return null;
  }, [mcGroups]);

  // ─── Chat: send message ────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isSendingRef.current) return;
    const requestMode = mode;

    // First send in empty state: trigger forward animation before adding message
    if (chatVisualStateRef.current === 'empty_centered') {
      applyChatVisualState('active_bottom');
    }

    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (botReplyTimerRef.current !== null) {
      window.clearTimeout(botReplyTimerRef.current);
      botReplyTimerRef.current = null;
    }
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    const validationMessage = getRetrieveValidationMessage(mode);
    if (validationMessage) {
      pushValidationReply(text, validationMessage, requestMode);
      return;
    }

    const ownerAccount = username.trim() || "本机节点";
    const replyPromise: Promise<{ answer: string; evidence: TraceEvidence[] | null }> =
      mode === "global"
        ? askFederationChat(text, {
            account: ownerAccount,
            isSelfCenterNode,
          })
            .then((result) => ({ answer: buildFederationReplyText(result), evidence: null }))
            .catch((error: unknown) => ({ answer: buildFederationErrorReply(error), evidence: null }))
        : askNodeRetrieve(text, ownerAccount, isSelfCenterNode)
            .then((result) => {
              // Extract evidence from local retrieval result for traceability
              const evidence: TraceEvidence[] = (result as { evidence?: unknown[] }).evidence
                ? ((result as { evidence: unknown[] }).evidence as TraceEvidence[])
                : null;
              return { answer: result.answer, evidence };
            })
            .catch((error: unknown) => ({ answer: buildNodeRetrieveErrorReply(error), evidence: null }));

    const thinkingTotalDelayMs = THINKING_TOTAL_DELAY_MS_BY_MODE[mode];
    const typingDelayMs = Math.max(0, thinkingTotalDelayMs - TYPING_STAGE_STATIC_DELAY_MS);

    isSendingRef.current = true;
    setIsSending(true);
    setInputValue("");

    const now = Date.now();
    const userId = `msg-${now}-user`;
    const typingId = `msg-${now + 1}-typing`;
    const botId = `msg-${now + 2}-bot`;

    pendingEntryIdsRef.current.add(userId);
    setMessages((prev) => [...prev, { id: userId, role: "user", content: text }]);

    typingTimerRef.current = window.setTimeout(() => {
      typingTimerRef.current = null;
      pendingEntryIdsRef.current.add(typingId);
      setMessages((prev) => [...prev, { id: typingId, role: "typing", content: "" }]);

      botReplyTimerRef.current = window.setTimeout(() => {
        botReplyTimerRef.current = null;
        void (async () => {
          const resolvedReply = await replyPromise;
          if (!isSendingRef.current) {
            return;
          }

          const replyText = resolvedReply.answer;
          const evidence = resolvedReply.evidence;

          pendingEntryIdsRef.current.add(botId);
          setMessages((prev) =>
            prev.filter((m) => m.id !== typingId).concat({
              id: botId,
              role: "bot",
              content: "",
              evidence: evidence ?? undefined,
            })
          );

          let renderedLength = 0;
          streamTimerRef.current = window.setInterval(() => {
            renderedLength = Math.min(replyText.length, renderedLength + BOT_STREAM_CHUNK_SIZE);
            const streamedText = replyText.slice(0, renderedLength);
            setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, content: streamedText } : m)));
            scrollToBottom();

            if (renderedLength >= replyText.length) {
              if (streamTimerRef.current !== null) {
                window.clearInterval(streamTimerRef.current);
                streamTimerRef.current = null;
              }
              void persistTurn(requestMode, [
                { role: "user", content: text, evidence: null },
                { role: "bot", content: replyText, evidence: evidence ?? null },
              ]);
              isSendingRef.current = false;
              setIsSending(false);
            }
          }, BOT_STREAM_INTERVAL_MS);
        })();
      }, typingDelayMs);
    }, TYPING_STAGE_STATIC_DELAY_MS);
  }, [
    applyChatVisualState,
    inputValue,
    getRetrieveValidationMessage,
    isSelfCenterNode,
    mode,
    persistTurn,
    pushValidationReply,
    scrollToBottom,
    username,
  ]);

  const syncInputHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    syncInputHeight(e.target);
  };

  useEffect(() => {
    syncInputHeight(inputRef.current);
  }, [inputValue, syncInputHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const updateMCGroup = useCallback((groupId: MCGroupId, patch: Partial<MCGroupState>) => {
    setMCGroups((prev) => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        ...patch,
      },
    }));
  }, []);

  const handleMCProviderChange = useCallback((groupId: MCGroupId, provider: MCProvider) => {
    updateMCGroup(groupId, {
      provider,
      model: MC_MODEL_OPTIONS[provider][0],
      connectError: "",
      connectSuccess: false,
      isConfigured: false,
    });
    setMCSaveSummary("");
    setMCSaveSummaryTone("");
  }, [updateMCGroup]);

  const handleMCFieldDraftChange = useCallback((groupId: MCGroupId, patch: Partial<MCGroupState>) => {
    updateMCGroup(groupId, {
      ...patch,
      connectError: "",
      connectSuccess: false,
      isConfigured: false,
    });
    setMCSaveSummary("");
    setMCSaveSummaryTone("");
  }, [updateMCGroup]);

  // ─── Model config: hide form sections on mount ────────────────────────────
  useLayoutEffect(() => {
    if (!mcMounted) return;
    const targets = [
      mcHeaderRef.current,
      mcFieldsRef.current,
      mcFooterRef.current,
    ].filter((el): el is HTMLDivElement => el !== null);
    const panel = mcPanelRef.current;

    if (panel) {
      gsap.set(panel, {
        "--mc-scrollbar-thumb-alpha": 0,
        "--mc-scrollbar-track-alpha": 0,
      });
    }

    if (targets.length > 0) {
      gsap.set(targets, { visibility: "hidden", opacity: 0, y: 20 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcMounted]);

  // ─── Model config: reveal form when opened ────────────────────────────────
  useEffect(() => {
    if (mcPhase !== "opened") return;

    const targets = [
      mcHeaderRef.current,
      mcFieldsRef.current,
      mcFooterRef.current,
    ].filter((el): el is HTMLDivElement => el !== null);
    const panel = mcPanelRef.current;
    if (targets.length === 0) return;

    mcRevealTlRef.current?.kill();
    const tl = gsap.timeline();
    mcRevealTlRef.current = tl;

    if (panel) {
      gsap.set(panel, {
        "--mc-scrollbar-thumb-alpha": 0,
        "--mc-scrollbar-track-alpha": 0,
      });
      tl.to(panel, {
        "--mc-scrollbar-thumb-alpha": 0.92,
        "--mc-scrollbar-track-alpha": 0.22,
        duration: 0.3,
        ease: "power2.out",
      }, 0.08);
    }

    targets.forEach((el, i) => {
      gsap.set(el, { visibility: "visible" });
      tl.to(el,
        { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" },
        i * 0.06,
      );
    });

    return () => { tl.kill(); };
  }, [mcPhase]);

  // ─── Model config: fade out form then trigger canvas close ────────────────
  useEffect(() => {
    if (mcPhase !== "fading_out") return;

    const targets = [
      mcFooterRef.current,
      mcFieldsRef.current,
      mcHeaderRef.current,
    ].filter((el): el is HTMLDivElement => el !== null);
    const panel = mcPanelRef.current;

    mcRevealTlRef.current?.kill();
    const tl = gsap.timeline({
      onComplete: () => setMCPhase("closing_canvas"),
    });
    mcRevealTlRef.current = tl;

    if (panel) {
      tl.to(panel, {
        "--mc-scrollbar-thumb-alpha": 0,
        "--mc-scrollbar-track-alpha": 0,
        duration: 0.16,
        ease: "power2.in",
      }, 0);
    }

    targets.forEach((el, i) => {
      tl.to(el,
        { opacity: 0, y: -15, duration: 0.18, ease: "power2.in" },
        i * 0.035,
      );
    });

    return () => { tl.kill(); };
  }, [mcPhase]);

  // ─── Model config: open / close handlers ──────────────────────────────────
  const handleMCOpen = useCallback(() => {
    if (mcPhase !== "closed") return;
    setMCSaveSummary("");
    setMCSaveSummaryTone("");
    setMCPhase("opening");
  }, [mcPhase]);

  const handleMCClose = useCallback(() => {
    if (mcPhase === "opened") {
      setMCPhase("fading_out");
      return;
    }
    if (mcPhase === "opening") {
      setMCPhase("closing_canvas");
    }
  }, [mcPhase]);

  useEffect(() => {
    if (mcPhase !== "opened") return;

    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleMCClose();
    };

    window.addEventListener("keydown", handleEscClose);
    return () => {
      window.removeEventListener("keydown", handleEscClose);
    };
  }, [mcPhase, handleMCClose]);

  const handleModeSwitch = useCallback((checked: boolean) => {
    const targetMode: Mode = checked ? "global" : "local";
    if (targetMode === mode) return;
    if (!checked) {
      onModeChange?.("local");
      return;
    }
    if (!mcGroups.judge.isConfigured) {
      setMCToast("未配置法官模型，无法进行全局检索");
      onModeChange?.("local");
      return;
    }
    if (!isSelfCenterNode) {
      setMCToast("未获得中心节点权限，无法使用全局检索");
      onModeChange?.("local");
      return;
    }
    onModeChange?.("global");
  }, [isSelfCenterNode, mcGroups.judge.isConfigured, mode, onModeChange]);

  // ─── Model config: connect ─────────────────────────────────────────────────
  const handleMCConnect = useCallback(async () => {
    const snapshot = mcGroups;
    const judgeGroup = snapshot.judge;
    const nextGroups: MCGroupStateMap = {
      local_query: { ...snapshot.local_query },
      embedding: { ...snapshot.embedding },
      rerank: { ...snapshot.rerank },
      judge: { ...snapshot.judge },
    };
    let successCount = 0;
    let failedCount = 0;

    setMCSaveSummary("");
    setMCSaveSummaryTone("");

    if (judgeGroup.provider !== "Local") {
      const judgeValidationError = validateMCGroup(judgeGroup);
      const judgeUrl = judgeGroup.baseUrl.trim();
      const judgeApiKey = judgeGroup.apiKey.trim();
      if (!judgeValidationError && judgeUrl && judgeApiKey) {
        try {
          await adminSubmitRequest(username.trim() || "unknown_user", "配置法官模型", judgeUrl);
        } catch {
          // 管理员申请提交失败不阻断本次连接流程
        }
      }
    }

    for (const { id } of MC_GROUP_DEFS) {
      const group = snapshot[id];
      const validationError = validateMCGroup(group);

      if (validationError) {
        failedCount += 1;
        nextGroups[id] = {
          ...nextGroups[id],
          isConnecting: false,
          connectError: validationError,
          connectSuccess: false,
          isConfigured: false,
        };
        updateMCGroup(id, {
          isConnecting: false,
          connectError: validationError,
          connectSuccess: false,
          isConfigured: false,
        });
        continue;
      }

      updateMCGroup(id, {
        isConnecting: true,
        connectError: "",
        connectSuccess: false,
      });

      try {
        const res = await fetch("/api/model-config/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildMCPayload(group)),
        });
        const data = await res.json() as { error?: string };

        if (!res.ok) {
          failedCount += 1;
          nextGroups[id] = {
            ...nextGroups[id],
            isConnecting: false,
            connectError: data.error ?? "连接失败，请检查 API Key 和网络设置",
            connectSuccess: false,
            isConfigured: false,
          };
          updateMCGroup(id, {
            isConnecting: false,
            connectError: data.error ?? "连接失败，请检查 API Key 和网络设置",
            connectSuccess: false,
            isConfigured: false,
          });
        } else {
          successCount += 1;
          nextGroups[id] = {
            ...nextGroups[id],
            isConnecting: false,
            connectError: "",
            connectSuccess: true,
            isConfigured: true,
          };
          updateMCGroup(id, {
            isConnecting: false,
            connectError: "",
            connectSuccess: true,
            isConfigured: true,
          });
        }
      } catch {
        failedCount += 1;
        nextGroups[id] = {
          ...nextGroups[id],
          isConnecting: false,
          connectError: "连接失败，请检查 API Key 和网络设置",
          connectSuccess: false,
          isConfigured: false,
        };
        updateMCGroup(id, {
          isConnecting: false,
          connectError: "连接失败，请检查 API Key 和网络设置",
          connectSuccess: false,
          isConfigured: false,
        });
      }
    }

    const persistedState = toRuntimeModelConfigState(nextGroups);
    onModelConfigStateChange?.(persistedState);

    if (successCount === MC_GROUP_DEFS.length) {
      setMCSaveSummary("全部模型连接成功");
      setMCSaveSummaryTone("success");
      return;
    }

    if (successCount > 0 && failedCount > 0) {
      setMCSaveSummary("部分模型连接成功，请检查未通过项");
      setMCSaveSummaryTone("warning");
      return;
    }

    if (failedCount > 0) {
      setMCSaveSummary("连接未完成，请检查配置项");
      setMCSaveSummaryTone("warning");
    }
  }, [
    mcGroups,
    onModelConfigStateChange,
    toRuntimeModelConfigState,
    updateMCGroup,
    username,
  ]);

  const handleMCBrowse = useCallback((groupId: MCGroupId) => {
    fileInputRefs.current[groupId]?.click();
  }, []);

  const handleMCFileSelect = useCallback((groupId: MCGroupId, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleMCFieldDraftChange(groupId, { modelPath: file.name });
  }, [handleMCFieldDraftChange]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div ref={layerRef} className="chat-interaction-layer" data-menu-open={menuOpen} data-mode={mode}>

      {mcToast && (
        <div className="chat-toast" role="status" aria-live="polite">
          {mcToast}
        </div>
      )}

      {/* ── Model Config Overlay ─────────────────────────────────────────── */}
      {mcMounted && (
        <>
          {/* Canvas SVG layer */}
          <div className="mc-canvas-layer">
            <ModelConfigCanvasLines
              open={mcCanvasOpen}
              menuOpen={menuOpen}
              onOpenComplete={() => setMCPhase("opened")}
              onCloseComplete={() => setMCPhase("closed")}
            />
          </div>

          <div
            className={`mc-canvas-close-anchor${mcCloseVisible ? " mc-canvas-close-anchor--visible" : ""}`}
            aria-hidden={!mcCloseVisible}
          >
            <button
              className="mc-close-btn"
              onClick={handleMCClose}
              aria-label="关闭模型配置"
              type="button"
            >
              <span className="mc-close-x" aria-hidden="true" />
            </button>
          </div>

          {/* Form panel layer — 跟随菜单同步左移（照搬 panelRef 逻辑） */}
          <div ref={mcPanelLayerRef} className="mc-panel-layer">
            <div ref={mcPanelRef} className="mc-panel">

              {/* Header */}
              <div ref={mcHeaderRef} className="mc-panel-header">
                <div className="mc-panel-title-group">
                  <span className="mc-eyebrow">MODEL CONFIG</span>
                  <h2 className="mc-panel-title">模型配置</h2>
                </div>
              </div>

              <div ref={mcFieldsRef} className="mc-groups">
                {MC_GROUP_DEFS.map(({ id, title }) => {
                  const group = mcGroups[id];
                  const baseId = `mc-${id}`;

                  return (
                    <section key={id} className="mc-group">
                      <h3 className="mc-group-title">{title}</h3>

                      <div className="mc-provider-row">
                        {(["OpenAI", "Ollama", "Local"] as MCProvider[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={`mc-provider-item${group.provider === p ? " mc-provider-item--active" : ""}`}
                            onClick={() => handleMCProviderChange(id, p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      <div className="mc-model-row">
                        <span className="mc-model-label">模型</span>
                        <div className="mc-model-options">
                          {MC_MODEL_OPTIONS[group.provider].map((m, i, arr) => (
                            <span key={`${id}-${m}`} className="mc-model-slot">
                              <button
                                type="button"
                                className={`mc-model-item${group.model === m ? " mc-model-item--active" : ""}`}
                                onClick={() => handleMCFieldDraftChange(id, { model: m })}
                              >
                                {m}
                              </button>
                              {i < arr.length - 1 && (
                                <span className="mc-model-divider" aria-hidden="true">/</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mc-fields">
                        {group.provider !== "Local" ? (
                          <>
                            <div className="mc-field">
                              <label className="mc-field-label" htmlFor={`${baseId}-base-url`}>
                                接口地址 (Base URL)
                              </label>
                              <input
                                id={`${baseId}-base-url`}
                                className="mc-field-input"
                                type="url"
                                value={group.baseUrl}
                                onChange={(e) => handleMCFieldDraftChange(id, { baseUrl: e.target.value })}
                                placeholder="https://api.openai.com/v1"
                                autoComplete="off"
                              />
                            </div>
                            <div className="mc-field">
                              <label className="mc-field-label" htmlFor={`${baseId}-api-key`}>
                                API Key
                              </label>
                              <input
                                id={`${baseId}-api-key`}
                                className="mc-field-input"
                                type="password"
                                value={group.apiKey}
                                onChange={(e) => handleMCFieldDraftChange(id, { apiKey: e.target.value })}
                                placeholder="sk-…"
                                autoComplete="new-password"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="mc-field">
                              <label className="mc-field-label" htmlFor={`${baseId}-model-path`}>
                                模型路径 (Model Path)
                              </label>
                              <div className="mc-field-path-row">
                                <input
                                  id={`${baseId}-model-path`}
                                  className="mc-field-input"
                                  type="text"
                                  value={group.modelPath}
                                  onChange={(e) => handleMCFieldDraftChange(id, { modelPath: e.target.value })}
                                  placeholder="/path/to/model.gguf"
                                  autoComplete="off"
                                />
                                <button
                                  type="button"
                                  className="mc-browse-btn"
                                  onClick={() => handleMCBrowse(id)}
                                >
                                  浏览
                                </button>
                              </div>
                              <span className="mc-field-hint">
                                请选择本地模型文件 (.gguf, .bin) 或项目环境路径
                              </span>
                              <input
                                ref={(el) => { fileInputRefs.current[id] = el; }}
                                type="file"
                                accept=".gguf,.bin"
                                style={{ display: "none" }}
                                onChange={(e) => handleMCFileSelect(id, e)}
                              />
                            </div>
                            <div className="mc-field">
                              <label className="mc-field-label" htmlFor={`${baseId}-local-url`}>
                                服务端口 (Localhost URL)
                              </label>
                              <input
                                id={`${baseId}-local-url`}
                                className="mc-field-input"
                                type="url"
                                value={group.localUrl}
                                onChange={(e) => handleMCFieldDraftChange(id, { localUrl: e.target.value })}
                                placeholder="http://localhost:8000/v1"
                                autoComplete="off"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {group.connectError && (
                        <p className="mc-group-error" role="alert">{group.connectError}</p>
                      )}
                      {group.connectSuccess && !group.connectError && (
                        <p className="mc-group-success">连接成功</p>
                      )}
                    </section>
                  );
                })}
              </div>

              {/* Footer */}
              <div ref={mcFooterRef} className="mc-footer">
                {mcSaveSummary && (
                  <p className={`mc-save-summary${mcSaveSummaryTone ? ` mc-save-summary--${mcSaveSummaryTone}` : ""}`}>
                    {mcSaveSummary}
                  </p>
                )}
                <button
                  type="button"
                  className="mc-save-btn"
                  onClick={handleMCConnect}
                  disabled={mcAnyConnecting}
                  aria-busy={mcAnyConnecting}
                >
                  {mcAnyConnecting ? "连接中…" : "保存并连接"}
                </button>
              </div>

            </div>
          </div>
        </>
      )}

      <div ref={sidebarRef} className="chat-history-panel">
        <button
          type="button"
          className="chat-history-new-btn animated-button"
          onClick={() => { void handleNewConversation(); }}
          aria-label="新建对话"
        >
          <svg viewBox="0 0 24 24" className="arr-2" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
          </svg>
          <span className="text chat-history-new-btn-text">
            <MessageSquarePlus size={14} strokeWidth={1.9} aria-hidden="true" />
            <span>新建对话</span>
          </span>
          <span className="circle" aria-hidden="true" />
          <svg viewBox="0 0 24 24" className="arr-1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
          </svg>
        </button>

        <div className="chat-history-divider" aria-hidden="true" />
        <h3 className="chat-history-title">最近对话</h3>
        {historyError && (
          <p className="chat-history-status chat-history-status--error" role="alert">{historyError}</p>
        )}

        <div ref={historyGroupsRef} className="chat-history-groups">
          <ChatHistoryGroup
            title="本地模式"
            items={conversationsByMode.local}
            activeConversationId={activeConversationId}
            isLoading={historyLoading}
            loadingConvId={historyLoadingConvId}
            onSelect={handleLoadConversation}
            onDelete={setDeleteTargetConv}
            formatTime={formatConversationTime}
          />
          <ChatHistoryGroup
            title="全局模式"
            items={conversationsByMode.global}
            activeConversationId={activeConversationId}
            isLoading={historyLoading}
            loadingConvId={historyLoadingConvId}
            onSelect={handleLoadConversation}
            onDelete={setDeleteTargetConv}
            formatTime={formatConversationTime}
          />
        </div>
      </div>

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      <div ref={panelRef} className="chat-interaction-panel" data-chat-state={chatVisualState}>
        <div className="chat-content-wrap">

          {/* ── Mode Toggle + Model Config Trigger ── */}
          <div ref={modeRowRef} className="chat-mode-row">
            <label htmlFor="mode-switch" className="switch" aria-label="切换模式">
              <input
                id="mode-switch"
                type="checkbox"
                checked={mode === "global"}
                onChange={(e) => handleModeSwitch(e.target.checked)}
              />
              <span>本地</span>
              <span>全局</span>
            </label>

            {/* 按钮结构完全照搬 README animated-button，文案改为"模型配置" */}
            <button
              type="button"
              className="animated-button mc-open-btn"
              onClick={handleMCOpen}
              disabled={mcPhase !== "closed"}
              aria-label="打开模型配置"
            >
              <svg viewBox="0 0 24 24" className="arr-2" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
              </svg>
              <span className="text">模型配置</span>
              <span className="circle" />
              <svg viewBox="0 0 24 24" className="arr-1" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
              </svg>
            </button>
          </div>

          {/* ── Messages Area ── */}
          <div
            ref={msgMaskRef}
            className="chat-messages-mask"
          >
            <div
              ref={listRef}
              className="chat-messages-list"
            >
              <div className="chat-messages-inner">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    data-msg-id={msg.id}
                    data-flip-id={msg.id}
                    className={`chat-bubble-wrapper chat-bubble-wrapper--${msg.role}`}
                  >
                    {msg.role === "typing" ? (
                      <div className="chat-bubble chat-bubble--bot chat-bubble--typing">
                        <span className="chat-typing-dot" />
                        <span className="chat-typing-dot" />
                        <span className="chat-typing-dot" />
                      </div>
                    ) : msg.role === "bot" ? (
                      <BotBubble
                        msgId={msg.id}
                        content={msg.content}
                        evidence={msg.evidence ?? null}
                        showTrace={Boolean(msg.evidence)}
                        onTrace={onOpenTrace ?? (() => { })}
                      />
                    ) : (
                      <div className={`chat-bubble chat-bubble--${msg.role}`}>{msg.content}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Input Area ── */}
          <div ref={inputAreaRef} className="chat-input-area">
            <div ref={inputInnerRef} className="chat-input-inner">
              <div ref={promptTextRef} className="chat-empty-prompt" aria-hidden="true">
                {'你可以在此输入问题'.split('').map((char, i) => (
                  <span key={i} className="chat-empty-prompt-char">{char}</span>
                ))}
              </div>
              <div className="chat-input-wrap">
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  placeholder="输入问题，按 Enter 发送…"
                  value={inputValue}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isSending}
                  aria-label="消息输入框"
                />
                <button
                  type="button"
                  className="button"
                  onClick={handleSend}
                  disabled={isSending || !inputValue.trim()}
                  aria-label="发送消息"
                >
                  <div className="button-box">
                    <span className="button-elem">
                      <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
                        <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z" />
                      </svg>
                    </span>
                    <span className="button-elem">
                      <svg viewBox="0 0 46 40" xmlns="http://www.w3.org/2000/svg">
                        <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z" />
                      </svg>
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {deleteTargetConv && typeof document !== "undefined" && createPortal(
        <div
          className="db-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingConv) {
              setDeleteTargetConv(null);
            }
          }}
        >
          <div
            className="db-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-delete-conversation-title"
          >
            <div className="db-modal-header">
              <p className="db-modal-eyebrow">CHAT · DELETE</p>
              <h3 id="chat-delete-conversation-title" className="db-modal-title db-modal-title--danger">
                删除对话
              </h3>
            </div>
            <div className="db-modal-body">
              <p className="db-modal-desc">
                确认删除对话《{deleteTargetConv.title}》？删除后不可恢复。
              </p>
            </div>
            <div className="db-modal-footer">
              <button
                className="db-modal-cancel"
                onClick={() => setDeleteTargetConv(null)}
                type="button"
                disabled={isDeletingConv}
              >
                取消
              </button>
              <button
                className="db-modal-confirm db-modal-confirm--danger chat-history-delete-confirm"
                onClick={handleDeleteConversation}
                type="button"
                disabled={isDeletingConv}
                aria-busy={isDeletingConv}
              >
                {isDeletingConv ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
