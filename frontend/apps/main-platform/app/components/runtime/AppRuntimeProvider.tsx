"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWatermark } from "@/app/components/watermark/WatermarkProvider";

const RUNTIME_STORAGE_KEY = "main-platform-runtime-profile-v1";
const DEFAULT_USERNAME = "图书馆-法律文献区";
const RUNTIME_PLATE_IDS: RuntimePlateId[] = ["plate-1", "plate-2", "plate-3", "plate-4", "plate-5"];
const LEGACY_SELF_USERNAME_MAP: Record<string, string> = {
  "安保处": DEFAULT_USERNAME,
  "本机节点": DEFAULT_USERNAME,
};

export type RuntimePlateId = "plate-1" | "plate-2" | "plate-3" | "plate-4" | "plate-5";
export type RuntimeModelProvider = "OpenAI" | "Ollama" | "Local";
export type RuntimeModelGroupId = "local_query" | "judge" | "embedding" | "rerank";

export interface RuntimeModelGroupState {
  provider: RuntimeModelProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  modelPath: string;
  localUrl: string;
  isConfigured: boolean;
}

export type RuntimeModelConfigState = Record<RuntimeModelGroupId, RuntimeModelGroupState>;

export interface SavedNodeLocation {
  plateId: RuntimePlateId;
  mapX: number;
  mapY: number;
  mapViewBoxWidth: number;
  mapViewBoxHeight: number;
  desktopX: number;
  desktopY: number;
  sceneX: number;
  sceneY: number;
  savedAt: number;
}

interface PersistedRuntimeState {
  username: string;
  avatarDataUrl: string | null;
  judgeModelConfigured: boolean;
  savedNodeLocation: SavedNodeLocation | null;
  modelConfigState: RuntimeModelConfigState;
  isSelfCenterNode: boolean;
}

interface AppRuntimeContextValue extends PersistedRuntimeState {
  locationRevision: number;
  isSelfCenterNode: boolean;
  isAdmin: boolean;
  setUsername: (nextUsername: string) => void;
  setAvatarDataUrl: (nextAvatarDataUrl: string | null) => void;
  setJudgeModelConfigured: (configured: boolean) => void;
  setSavedNodeLocation: (nextLocation: SavedNodeLocation | null) => void;
  setModelConfigState: (nextState: RuntimeModelConfigState) => void;
  setIsSelfCenterNode: (isCenter: boolean) => void;
  setIsAdmin: (isAdmin: boolean) => void;
}

function createDefaultRuntimeModelGroupState(): RuntimeModelGroupState {
  return {
    provider: "OpenAI",
    model: "gpt",
    baseUrl: "",
    apiKey: "",
    modelPath: "",
    localUrl: "",
    isConfigured: false,
  };
}

function createDefaultRuntimeModelConfigState(judgeConfigured = false): RuntimeModelConfigState {
  return {
    local_query: createDefaultRuntimeModelGroupState(),
    embedding: createDefaultRuntimeModelGroupState(),
    rerank: createDefaultRuntimeModelGroupState(),
    judge: {
      ...createDefaultRuntimeModelGroupState(),
      isConfigured: judgeConfigured,
    },
  };
}

const DEFAULT_RUNTIME_STATE: PersistedRuntimeState = {
  username: DEFAULT_USERNAME,
  avatarDataUrl: null,
  judgeModelConfigured: false,
  savedNodeLocation: null,
  modelConfigState: createDefaultRuntimeModelConfigState(false),
  isSelfCenterNode: false,
};

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

function normalizeUsername(nextUsername: string): string {
  const normalized = nextUsername.trim();
  if (!normalized) return DEFAULT_USERNAME;
  return LEGACY_SELF_USERNAME_MAP[normalized] ?? normalized;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRuntimeModelProvider(value: unknown): value is RuntimeModelProvider {
  return value === "OpenAI" || value === "Ollama" || value === "Local";
}

function parseRuntimeModelConfigState(
  value: unknown,
  fallbackJudgeConfigured: boolean,
): RuntimeModelConfigState {
  const fallback = createDefaultRuntimeModelConfigState(fallbackJudgeConfigured);
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const parsed = value as Partial<Record<RuntimeModelGroupId, Partial<RuntimeModelGroupState>>>;
  const groupIds: RuntimeModelGroupId[] = ["local_query", "embedding", "rerank", "judge"];

  const result = groupIds.reduce((acc, groupId) => {
    const rawGroup = parsed[groupId];
    const fallbackGroup = fallback[groupId];

    if (!rawGroup || typeof rawGroup !== "object") {
      acc[groupId] = fallbackGroup;
      return acc;
    }

    const provider = isRuntimeModelProvider(rawGroup.provider) ? rawGroup.provider : fallbackGroup.provider;
    acc[groupId] = {
      provider,
      model: typeof rawGroup.model === "string" ? rawGroup.model : fallbackGroup.model,
      baseUrl: typeof rawGroup.baseUrl === "string" ? rawGroup.baseUrl : fallbackGroup.baseUrl,
      apiKey: typeof rawGroup.apiKey === "string" ? rawGroup.apiKey : fallbackGroup.apiKey,
      modelPath: typeof rawGroup.modelPath === "string" ? rawGroup.modelPath : fallbackGroup.modelPath,
      localUrl: typeof rawGroup.localUrl === "string" ? rawGroup.localUrl : fallbackGroup.localUrl,
      isConfigured: typeof rawGroup.isConfigured === "boolean" ? rawGroup.isConfigured : fallbackGroup.isConfigured,
    };
    return acc;
  }, {} as RuntimeModelConfigState);

  result.judge = {
    ...result.judge,
    isConfigured: result.judge.isConfigured || fallbackJudgeConfigured,
  };

  return result;
}

function isSameRuntimeModelConfigState(
  prevState: RuntimeModelConfigState,
  nextState: RuntimeModelConfigState,
): boolean {
  const groupIds: RuntimeModelGroupId[] = ["local_query", "embedding", "rerank", "judge"];
  return groupIds.every((groupId) => {
    const prevGroup = prevState[groupId];
    const nextGroup = nextState[groupId];
    return (
      prevGroup.provider === nextGroup.provider &&
      prevGroup.model === nextGroup.model &&
      prevGroup.baseUrl === nextGroup.baseUrl &&
      prevGroup.apiKey === nextGroup.apiKey &&
      prevGroup.modelPath === nextGroup.modelPath &&
      prevGroup.localUrl === nextGroup.localUrl &&
      prevGroup.isConfigured === nextGroup.isConfigured
    );
  });
}

function isSavedNodeLocation(value: unknown): value is SavedNodeLocation {
  if (!value || typeof value !== "object") return false;

  const location = value as Partial<SavedNodeLocation>;
  const validPlateId =
    typeof location.plateId === "string" &&
    RUNTIME_PLATE_IDS.includes(location.plateId as RuntimePlateId);

  return (
    validPlateId &&
    isFiniteNumber(location.mapX) &&
    isFiniteNumber(location.mapY) &&
    isFiniteNumber(location.mapViewBoxWidth) &&
    isFiniteNumber(location.mapViewBoxHeight) &&
    isFiniteNumber(location.desktopX) &&
    isFiniteNumber(location.desktopY) &&
    isFiniteNumber(location.sceneX) &&
    isFiniteNumber(location.sceneY) &&
    isFiniteNumber(location.savedAt)
  );
}

function readPersistedRuntimeState(): PersistedRuntimeState {
  if (typeof window === "undefined") {
    return DEFAULT_RUNTIME_STATE;
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (!raw) return DEFAULT_RUNTIME_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedRuntimeState>;
    const persistedJudgeConfigured = Boolean(parsed.judgeModelConfigured);
    const modelConfigState = parseRuntimeModelConfigState(parsed.modelConfigState, persistedJudgeConfigured);
    const judgeModelConfigured = persistedJudgeConfigured || modelConfigState.judge.isConfigured;

    return {
      username: normalizeUsername(typeof parsed.username === "string" ? parsed.username : DEFAULT_USERNAME),
      avatarDataUrl: typeof parsed.avatarDataUrl === "string" ? parsed.avatarDataUrl : null,
      judgeModelConfigured,
      savedNodeLocation: isSavedNodeLocation(parsed.savedNodeLocation) ? parsed.savedNodeLocation : null,
      modelConfigState,
      isSelfCenterNode: typeof parsed.isSelfCenterNode === "boolean" ? parsed.isSelfCenterNode : false,
    };
  } catch {
    return DEFAULT_RUNTIME_STATE;
  }
}

interface AppRuntimeProviderProps {
  children: ReactNode;
}

export function AppRuntimeProvider({ children }: AppRuntimeProviderProps) {
  const { setWatermarkName } = useWatermark();
  const [runtimeState, setRuntimeState] = useState<PersistedRuntimeState>(() => readPersistedRuntimeState());
  const [locationRevision, setLocationRevision] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setWatermarkName(runtimeState.username);
  }, [runtimeState.username, setWatermarkName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimeState));
  }, [runtimeState]);

  const setUsername = useCallback((nextUsername: string) => {
    setRuntimeState((prev) => ({
      ...prev,
      username: normalizeUsername(nextUsername),
    }));
  }, []);

  const setAvatarDataUrl = useCallback((nextAvatarDataUrl: string | null) => {
    setRuntimeState((prev) => ({
      ...prev,
      avatarDataUrl: nextAvatarDataUrl,
    }));
  }, []);

  const setJudgeModelConfigured = useCallback((configured: boolean) => {
    setRuntimeState((prev) => ({
      ...prev,
      judgeModelConfigured: configured,
      modelConfigState: {
        ...prev.modelConfigState,
        judge: {
          ...prev.modelConfigState.judge,
          isConfigured: configured,
        },
      },
    }));
  }, []);

  const setSavedNodeLocation = useCallback((nextLocation: SavedNodeLocation | null) => {
    setRuntimeState((prev) => ({
      ...prev,
      savedNodeLocation: nextLocation,
    }));
    setLocationRevision((prev) => prev + 1);
  }, []);

  const setModelConfigState = useCallback((nextState: RuntimeModelConfigState) => {
    setRuntimeState((prev) => {
      if (isSameRuntimeModelConfigState(prev.modelConfigState, nextState)) {
        return prev;
      }
      return {
        ...prev,
        modelConfigState: nextState,
        judgeModelConfigured: nextState.judge.isConfigured,
      };
    });
  }, []);

  const setIsSelfCenterNode = useCallback((isCenter: boolean) => {
    setRuntimeState((prev) => ({
      ...prev,
      isSelfCenterNode: isCenter,
    }));
  }, []);

  const handleSetIsAdmin = useCallback((nextIsAdmin: boolean) => {
    setIsAdmin(nextIsAdmin);
  }, []);

  const contextValue = useMemo<AppRuntimeContextValue>(
    () => ({
      ...runtimeState,
      locationRevision,
      isAdmin,
      setUsername,
      setAvatarDataUrl,
      setJudgeModelConfigured,
      setSavedNodeLocation,
      setModelConfigState,
      setIsSelfCenterNode,
      setIsAdmin: handleSetIsAdmin,
    }),
    [
      locationRevision,
      runtimeState,
      isAdmin,
      setAvatarDataUrl,
      setJudgeModelConfigured,
      setSavedNodeLocation,
      setModelConfigState,
      setUsername,
      setIsSelfCenterNode,
      handleSetIsAdmin,
    ],
  );

  return <AppRuntimeContext.Provider value={contextValue}>{children}</AppRuntimeContext.Provider>;
}

export function useAppRuntime() {
  const context = useContext(AppRuntimeContext);
  if (!context) {
    throw new Error("useAppRuntime must be used within AppRuntimeProvider");
  }
  return context;
}
