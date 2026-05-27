"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_WATERMARK_NAME = "图书馆-法律文献区";

type WatermarkContextValue = {
  watermarkName: string;
  setWatermarkName: (nextName: string) => void;
};

const WatermarkContext = createContext<WatermarkContextValue | null>(null);

interface WatermarkProviderProps {
  children: ReactNode;
  initialName?: string;
}

export function WatermarkProvider({ children, initialName }: WatermarkProviderProps) {
  const [watermarkName, setWatermarkNameState] = useState(initialName ?? DEFAULT_WATERMARK_NAME);

  const setWatermarkName = useCallback((nextName: string) => {
    const normalized = nextName.trim();
    setWatermarkNameState(normalized || DEFAULT_WATERMARK_NAME);
  }, []);

  const contextValue = useMemo<WatermarkContextValue>(
    () => ({ watermarkName, setWatermarkName }),
    [watermarkName, setWatermarkName],
  );

  return <WatermarkContext.Provider value={contextValue}>{children}</WatermarkContext.Provider>;
}

export function useWatermark() {
  const context = useContext(WatermarkContext);
  if (!context) {
    throw new Error("useWatermark must be used within WatermarkProvider");
  }
  return context;
}
