"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { D1Timeline } from "./components/D1Timeline";
import { D2Visualization } from "./components/D2Visualization";
import { D3SandboxThreeMvp } from "./components/D3SandboxThreeMvp";
import { D4Visualization } from "./components/D4Visualization";
import { D5WordCloud } from "./components/D5WordCloud";
import { gsap } from "gsap";
import { GlobalTopNav } from "../shared/GlobalTopNav";
import { LINE_DRAW_EASE } from "../shared/animation";
import {
  VW,
  VH,
  MACRO_STROKE_WIDTH,
  MACRO_LINE_INITIAL,
  MACRO_LINE_SETTLED,
} from "../shared/coords";
import { DEFAULT_ACTIVE_SECTOR_ID } from "./macroData";
import { useAppRuntime } from "@/app/components/runtime/AppRuntimeProvider";

/* ─── 坐标常量 ────────────────────────────────────────────── */
// viewBox = 1440 × 900 (same as Window 1 / 3)
const X_LEFT = VW * 0.25;         // 360  – p1 (25%)
const X_RIGHT = VW * 0.75;        // 1080 – p2 (75%)
const Y_MID = VH / 2;             // 450  – p3 / p4


interface MacroWindowProps {
  onBack?: () => void;
  onNavigateToMain?: () => void;
  onOpenDatabase?: () => void;
  defaultSelectedNodeId?: string;
}

export function MacroWindow({
  onBack,
  onNavigateToMain,
  onOpenDatabase,
  defaultSelectedNodeId,
}: MacroWindowProps) {
  const { username, savedNodeLocation, locationRevision, isSelfCenterNode } = useAppRuntime();
  const svgRef = useRef<SVGSVGElement>(null);
  const modulesRef = useRef<HTMLDivElement>(null);
  const [d1Visible, setD1Visible] = useState(false);
  const [activeSectorId, setActiveSectorId] = useState(DEFAULT_ACTIVE_SECTOR_ID);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    defaultSelectedNodeId ?? null,
  );

  const selfNodePlacement = useMemo(
    () =>
      savedNodeLocation
        ? {
            plateId: savedNodeLocation.plateId,
            sceneX: savedNodeLocation.sceneX,
            sceneY: savedNodeLocation.sceneY,
          }
        : null,
    [savedNodeLocation?.plateId, savedNodeLocation?.sceneX, savedNodeLocation?.sceneY],
  );

  const handleSectorChange = useCallback((sectorId: string) => {
    setActiveSectorId(sectorId);
    setSelectedNodeId(null);
  }, []);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  /* ─── 入场动画 ─────────────────────────────────────────── */
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const modules = modulesRef.current;
    if (!svg) return;

    // Query elements
    const p1 = svg.querySelector<SVGLineElement>("#macro-p1");
    const p2 = svg.querySelector<SVGLineElement>("#macro-p2");
    const p3 = svg.querySelector<SVGLineElement>("#macro-p3");
    const p4 = svg.querySelector<SVGLineElement>("#macro-p4");
    const d1 = svg.querySelector<SVGRectElement>("#macro-d1");
    const d2 = svg.querySelector<SVGRectElement>("#macro-d2");
    const d4 = svg.querySelector<SVGRectElement>("#macro-d4");
    const d5 = svg.querySelector<SVGRectElement>("#macro-d5");

    const allLines = [p1, p2, p3, p4].filter(Boolean) as SVGLineElement[];

    // 初始化线条 dash
    allLines.forEach((line) => {
      const len = line.getTotalLength();
      gsap.set(line, {
        strokeDasharray: len,
        strokeDashoffset: len,
        stroke: MACRO_LINE_INITIAL,
        opacity: 1,
      });
    });

    // 初始化四块白色区域（不可见）
    [d1, d2, d4, d5].filter(Boolean).forEach((rect) => {
      gsap.set(rect!, { fillOpacity: 0 });
    });

    // 模块层初始不可见
    if (modules) gsap.set(modules, { autoAlpha: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        setD1Visible(true);
      },
    });

    /* 阶段 1 (0–0.4s)：p1 ↓  p2 ↑ */
    tl.to([p1, p2].filter(Boolean), {
      strokeDashoffset: 0,
      duration: 0.4,
      ease: LINE_DRAW_EASE,
      stagger: 0,
    }, 0);

    /* 阶段 2 (0.4–0.8s)：p3 ←  p4 → */
    tl.to([p3, p4].filter(Boolean), {
      strokeDashoffset: 0,
      duration: 0.4,
      ease: LINE_DRAW_EASE,
      stagger: 0,
    }, 0.4);

    /* 0.8s 时刻：变色 */
    tl.to(allLines, {
      stroke: MACRO_LINE_SETTLED,
      duration: 0.25,
      ease: "power2.out",
    }, 0.8);

    /* 阶段 3 (0.8–1.2s)：白色区域覆盖 */
    // d1 (左上): 从上往下
    if (d1) {
      tl.fromTo(d1,
        { attr: { y: 0, height: 0 }, fillOpacity: 1 },
        { attr: { height: Y_MID }, duration: 0.4, ease: "power2.inOut" },
        0.8,
      );
    }
    // d4 (右上): 从上往下
    if (d4) {
      tl.fromTo(d4,
        { attr: { y: 0, height: 0 }, fillOpacity: 1 },
        { attr: { height: Y_MID }, duration: 0.4, ease: "power2.inOut" },
        0.8,
      );
    }
    // d2 (左下): 从下往上 — 先设置 y=VH, height=0, 然后同时改 y 和 height
    if (d2) {
      tl.fromTo(d2,
        { attr: { y: VH, height: 0 }, fillOpacity: 1 },
        { attr: { y: Y_MID, height: VH - Y_MID }, duration: 0.4, ease: "power2.inOut" },
        0.8,
      );
    }
    // d5 (右下): 从下往上
    if (d5) {
      tl.fromTo(d5,
        { attr: { y: VH, height: 0 }, fillOpacity: 1 },
        { attr: { y: Y_MID, height: VH - Y_MID }, duration: 0.4, ease: "power2.inOut" },
        0.8,
      );
    }

    /* 阶段 4 (1.2–1.6s)：功能模块淡入 */
    if (modules) {
      tl.to(modules, {
        autoAlpha: 1,
        duration: 0.4,
        ease: "power2.out",
      }, 1.2);
    }

    return () => { tl.kill(); };
  }, []);

  return (
    <div className="macro-window-page">
      <GlobalTopNav
        currentWindow="macro"
        onNavigateToMain={onNavigateToMain}
        onNavigateToDatabase={onOpenDatabase}
        onNavigateToMacro={undefined}
        onLogout={onBack}
      />

      <div className="macro-window-content-shell">

        {/* ── SVG 画布层 ──────────────────────────────────────── */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMid slice"
          className="macro-svg-canvas"
          aria-hidden="true"
        >
          {/* 四块白色填充区域 — 渲染在线条之下 */}
          {/* d1: 左上 (0,0) → (X_LEFT, Y_MID) */}
          <rect id="macro-d1" x={0} y={0} width={X_LEFT} height={Y_MID} fill="#F5F5F5" fillOpacity={0} />
          {/* d2: 左下 (0, Y_MID) → (X_LEFT, VH) */}
          <rect id="macro-d2" x={0} y={Y_MID} width={X_LEFT} height={VH - Y_MID} fill="#F5F5F5" fillOpacity={0} />
          {/* d4: 右上 (X_RIGHT, 0) → (VW, Y_MID) */}
          <rect id="macro-d4" x={X_RIGHT} y={0} width={VW - X_RIGHT} height={Y_MID} fill="#F5F5F5" fillOpacity={0} />
          {/* d5: 右下 (X_RIGHT, Y_MID) → (VW, VH) */}
          <rect id="macro-d5" x={X_RIGHT} y={Y_MID} width={VW - X_RIGHT} height={VH - Y_MID} fill="#F5F5F5" fillOpacity={0} />

          {/* p1: 左边界竖线，从上→下 */}
          <line
            id="macro-p1"
            x1={X_LEFT} y1={0}
            x2={X_LEFT} y2={VH}
            stroke={MACRO_LINE_INITIAL}
            strokeWidth={MACRO_STROKE_WIDTH}
          />
          {/* p2: 右边界竖线，从下→上 (path direction reversed via strokeDashoffset) */}
          <line
            id="macro-p2"
            x1={X_RIGHT} y1={VH}
            x2={X_RIGHT} y2={0}
            stroke={MACRO_LINE_INITIAL}
            strokeWidth={MACRO_STROKE_WIDTH}
          />
          {/* p3: 左区中轴横线，从 p1 向左 */}
          <line
            id="macro-p3"
            x1={X_LEFT}  y1={Y_MID}
            x2={0}       y2={Y_MID}
            stroke={MACRO_LINE_INITIAL}
            strokeWidth={MACRO_STROKE_WIDTH}
          />
          {/* p4: 右区中轴横线，从 p2 向右 */}
          <line
            id="macro-p4"
            x1={X_RIGHT} y1={Y_MID}
            x2={VW}      y2={Y_MID}
            stroke={MACRO_LINE_INITIAL}
            strokeWidth={MACRO_STROKE_WIDTH}
          />
        </svg>

        {/* ── 功能模块层（1.2s 后淡入） ────────────────────────── */}
        <div ref={modulesRef} className="macro-modules-layer">
          {/* d1 区 — 左上 */}
          <section className="macro-zone macro-zone--d1">
            <D1Timeline visible={d1Visible} />
          </section>
          {/* d2 区 — 左下 */}
          <section className="macro-zone macro-zone--d2">
            <D2Visualization visible={d1Visible} selfNodeName={username} />
          </section>
          {/* d3 区 — 中间大片（暗色） */}
          <section className="macro-zone macro-zone--d3" style={{ padding: 0, overflow: 'hidden' }}>
            <D3SandboxThreeMvp
              visible={d1Visible}
              onSectorChange={handleSectorChange}
              onNodeSelect={handleNodeSelect}
              selfNodeName={username}
              isSelfCenterNode={isSelfCenterNode}
              selfNodePlacement={selfNodePlacement}
              selectionRevision={locationRevision}
            />
          </section>
          {/* d4 区 — 右上 */}
          <section className="macro-zone macro-zone--d4">
            <D4Visualization
              visible={d1Visible}
              activeSectorId={activeSectorId}
              selectedNodeId={selectedNodeId}
              selfNodeName={username}
            />
          </section>
          {/* d5 区 — 右下 */}
          <section className="macro-zone macro-zone--d5">
            <D5WordCloud visible={d1Visible} activeSectorId={activeSectorId} selectedNodeId={selectedNodeId} selfNodeName={username} />
          </section>
        </div>

      </div>
    </div>
  );
}
