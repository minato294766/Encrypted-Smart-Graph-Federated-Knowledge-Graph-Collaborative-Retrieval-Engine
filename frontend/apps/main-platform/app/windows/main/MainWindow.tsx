"use client";

import { useState, useCallback } from "react";
import { DotGrid } from "./components/DotGrid";
import { ChatCanvasLines } from "./components/ChatCanvasLines";
import { ChatInteractionPanel } from "./components/ChatInteractionPanel";
import { TraceWindow, type TraceEvidence } from "./components/TraceWindow";
import { GlobalTopNav } from "../shared/GlobalTopNav";
import { useAppRuntime } from "@/app/components/runtime/AppRuntimeProvider";

type ChatMode = "local" | "global";

interface MainWindowProps {
  onBack?: () => void;
  onOpenDatabase?: () => void;
  onOpenMacro?: () => void;
}

export function MainWindow({ onBack, onOpenDatabase, onOpenMacro }: MainWindowProps) {
  const { modelConfigState, setModelConfigState, isSelfCenterNode } = useAppRuntime();
  const [canvasReady, setCanvasReady] = useState(false);
  const [traceTarget, setTraceTarget] = useState<{ msgId: string; evidence: TraceEvidence[] } | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("local");

  const handleOpenTrace = useCallback((msgId: string, _content: string, evidence: TraceEvidence[]) => {
    setTraceTarget({ msgId, evidence });
  }, []);

  const handleCloseTrace = useCallback(() => {
    setTraceTarget(null);
  }, []);

  return (
    <div className="main-window-page">
      <GlobalTopNav
        currentWindow="main"
        onNavigateToMain={undefined}
        onNavigateToDatabase={onOpenDatabase}
        onNavigateToMacro={onOpenMacro}
        onLogout={onBack}
      />

      <div className="main-window-content-shell">
        {/* DotGrid: z-index 0, full-screen background */}
        <div className="main-window-dotgrid-bg">
          <DotGrid
            dotSize={2}
            gap={12}
            baseColor="#6b6b6b"
            activeColor="#0047FF"
            proximity={150}
            speedTrigger={100}
            shockRadius={250}
            shockStrength={5}
            maxSpeed={5000}
            resistance={750}
            returnDuration={1.5}
          />
        </div>

        {/* ChatCanvasLines: z-index 5, SVG canvas layer between dotgrid and menu */}
        <div className="main-window-canvas-layer">
          <ChatCanvasLines
            menuOpen={false}
            mode={chatMode}
            onComplete={() => setCanvasReady(true)}
          />
        </div>

        {/* ChatInteractionPanel: z-index 6, interactive chat layer above canvas, pointer-events on children only */}
        <ChatInteractionPanel
          menuOpen={false}
          canvasReady={canvasReady}
          mode={chatMode}
          onModeChange={setChatMode}
          onOpenTrace={handleOpenTrace}
          initialModelConfigState={modelConfigState}
          onModelConfigStateChange={setModelConfigState}
          isSelfCenterNode={isSelfCenterNode}
        />

        {/* TraceWindow: z-index 200, full-screen overlay, mounted only when a trace is active */}
        {traceTarget && (
          <TraceWindow
            msgId={traceTarget.msgId}
            evidence={traceTarget.evidence}
            onClose={handleCloseTrace}
          />
        )}

      </div>
    </div>
  );
}
