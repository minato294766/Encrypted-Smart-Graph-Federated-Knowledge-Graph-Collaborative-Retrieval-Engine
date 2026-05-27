"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  VW,
  VH,
  MC_CANVAS_INITIAL,
  MC_CANVAS_EXPANDED,
  MC_CANVAS_MENU_OPEN,
  MC_CANVAS_FILL,
  MC_CANVAS_LINE_ACTIVE,
  MC_CANVAS_LINE_INITIAL,
  MC_CANVAS_STROKE_WIDTH,
} from "../../shared/coords";
import { LINE_DRAW_EASE } from "../../shared/animation";

type Coords = { x1: number; x2: number; y1: number; y2: number };

export interface ModelConfigCanvasLinesProps {
  open:             boolean;
  menuOpen?:        boolean;
  onOpenComplete?:  () => void;
  onCloseComplete?: () => void;
}

// ─── 将四条线的 SVG 属性同步到当前 coords（与 ChatCanvasLines 逻辑完全一致）──
function syncLines(svg: SVGSVGElement, c: Coords) {
  const set = (id: string, attrs: Record<string, number>) => {
    const el = svg.querySelector<SVGLineElement>(`#${id}`);
    if (el) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  };
  // 竖线贯穿全高，横线贯穿全宽
  set("mc-line-left",   { x1: c.x1, y1: 0,   x2: c.x1, y2: VH });
  set("mc-line-right",  { x1: c.x2, y1: 0,   x2: c.x2, y2: VH });
  set("mc-line-top",    { x1: 0,    y1: c.y1, x2: VW,   y2: c.y1 });
  set("mc-line-bottom", { x1: 0,    y1: c.y2, x2: VW,   y2: c.y2 });
}

function syncRect(rect: SVGRectElement | null, c: Coords) {
  if (!rect) return;
  rect.setAttribute("x",      String(c.x1));
  rect.setAttribute("y",      String(c.y1));
  rect.setAttribute("width",  String(Math.max(0, c.x2 - c.x1)));
  rect.setAttribute("height", String(Math.max(0, c.y2 - c.y1)));
}

export function ModelConfigCanvasLines({
  open,
  menuOpen = false,
  onOpenComplete,
  onCloseComplete,
}: ModelConfigCanvasLinesProps) {
  const svgRef             = useRef<SVGSVGElement>(null);
  const coordsRef          = useRef<Coords>({ ...MC_CANVAS_INITIAL });
  const tlRef              = useRef<gsap.core.Timeline | null>(null);

  // 与 ChatCanvasLines 完全一致的菜单联动辅助 refs
  const entryDoneRef       = useRef(false);
  const menuTweenRef       = useRef<gsap.core.Tween | null>(null);
  const pendingMenuOpenRef = useRef<boolean | null>(null);

  const onOpenCompleteRef  = useRef(onOpenComplete);
  const onCloseCompleteRef = useRef(onCloseComplete);
  useEffect(() => { onOpenCompleteRef.current  = onOpenComplete; });
  useEffect(() => { onCloseCompleteRef.current = onCloseComplete; });

  // ─── 挂载时初始化 SVG（dashoffset=全长，填充透明）────────────────────
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const coords = coordsRef.current;
    Object.assign(coords, MC_CANVAS_INITIAL);

    const lines = (["mc-line-top", "mc-line-bottom", "mc-line-left", "mc-line-right"] as const)
      .map(id => svg.querySelector<SVGLineElement>(`#${id}`))
      .filter((l): l is SVGLineElement => l !== null);

    lines.forEach((line) => {
      const len = line.getTotalLength();
      gsap.set(line, {
        strokeDasharray:  len,
        strokeDashoffset: len,
        stroke:           MC_CANVAS_LINE_INITIAL,
        opacity:          1,
      });
    });

    const fillRect = svg.querySelector<SVGRectElement>("#mc-fill-rect");
    if (fillRect) {
      syncRect(fillRect, coords);
      gsap.set(fillRect, { fillOpacity: 0 });
    }
  }, []);

  // ─── 卸载时清理 ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      tlRef.current?.kill();
      menuTweenRef.current?.kill();
    };
  }, []);

  // ─── 主动画：监听 open 变化驱动正向（画线+扩张）或逆向（时间倒流）──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    if (!open) {
      // 逆向：时间倒流退回，onReverseComplete 后通知父组件
      entryDoneRef.current = false;
      menuTweenRef.current?.kill();
      const tl = tlRef.current;
      if (!tl) return;
      tl.eventCallback("onReverseComplete", () => {
        onCloseCompleteRef.current?.();
      });
      tl.timeScale(1.2);
      tl.reverse();
      return;
    }

    // 正向动画（比主画布快约 15%）
    tlRef.current?.kill();
    menuTweenRef.current?.kill();
    entryDoneRef.current    = false;
    pendingMenuOpenRef.current = null;

    const coords = coordsRef.current;
    Object.assign(coords, MC_CANVAS_INITIAL);

    const lines = (["mc-line-top", "mc-line-bottom", "mc-line-left", "mc-line-right"] as const)
      .map(id => svg.querySelector<SVGLineElement>(`#${id}`))
      .filter((l): l is SVGLineElement => l !== null);

    const fillRect = svg.querySelector<SVGRectElement>("#mc-fill-rect");

    // 重置初始态
    lines.forEach((line) => {
      const len = line.getTotalLength();
      gsap.set(line, { strokeDasharray: len, strokeDashoffset: len, stroke: MC_CANVAS_LINE_INITIAL });
    });
    syncRect(fillRect, coords);
    if (fillRect) gsap.set(fillRect, { fillOpacity: 0 });

    const tl = gsap.timeline();

    // 阶段1：画线（小幅提速）
    tl.to(lines, {
      strokeDashoffset: 0,
      duration: 0.78,
      stagger:  0.05,
      ease:     LINE_DRAW_EASE,
    }, 0);

    // 阶段2：变色 + 填充 + 扩张（衔接提速）
    const phase2Start = 0.16 + 0.78;

    tl.to(lines, {
      stroke:   MC_CANVAS_LINE_ACTIVE,
      duration: 0.34,
      ease:     "power2.out",
    }, phase2Start);

    if (fillRect) {
      tl.to(fillRect, {
        fillOpacity: 1,
        duration:    0.12,
        ease:        "power2.out",
      }, phase2Start);
    }

    tl.to(coords, {
      ...MC_CANVAS_EXPANDED,
      duration: 0.34,
      ease:     "power3.inOut",
      onUpdate: () => {
        syncLines(svg, coords);
        syncRect(fillRect, coords);
      },
      onComplete: () => {
        entryDoneRef.current = true;
        // 入场完成后，补执行入场期间积压的菜单意图（与 ChatCanvasLines 完全一致）
        if (pendingMenuOpenRef.current !== null) {
          const target = pendingMenuOpenRef.current ? MC_CANVAS_MENU_OPEN : MC_CANVAS_EXPANDED;
          pendingMenuOpenRef.current = null;
          menuTweenRef.current?.kill();
          menuTweenRef.current = gsap.to(coords, {
            x1: target.x1,
            x2: target.x2,
            duration: 0.36,
            ease:     "power3.inOut",
            onUpdate: () => {
              syncLines(svg, coords);
              syncRect(fillRect, coords);
            },
          });
        }
        onOpenCompleteRef.current?.();
      },
    }, phase2Start);

    tlRef.current = tl;
  }, [open]);

  // ─── 菜单联动：监听 menuOpen 变化，平移 x1/x2（照搬 ChatCanvasLines）──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // 入场动画尚未完成：记录最新意图，待入场结束后由 onComplete 补执行
    if (!entryDoneRef.current) {
      pendingMenuOpenRef.current = menuOpen;
      return;
    }

    const coords   = coordsRef.current;
    const fillRect = svg.querySelector<SVGRectElement>("#mc-fill-rect");
    const target   = menuOpen ? MC_CANVAS_MENU_OPEN : MC_CANVAS_EXPANDED;

    menuTweenRef.current?.kill();
    menuTweenRef.current = gsap.to(coords, {
      x1: target.x1,
      x2: target.x2,
      duration: 0.36,
      ease:     "power3.inOut",
      onUpdate: () => {
        syncLines(svg, coords);
        syncRect(fillRect, coords);
      },
    });

    return () => { menuTweenRef.current?.kill(); };
  }, [menuOpen]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid slice"
      className="mc-canvas-svg"
      aria-hidden="true"
    >
      {/* 填充 rect：在线条之下 */}
      <rect
        id="mc-fill-rect"
        x={MC_CANVAS_INITIAL.x1}
        y={MC_CANVAS_INITIAL.y1}
        width={MC_CANVAS_INITIAL.x2  - MC_CANVAS_INITIAL.x1}
        height={MC_CANVAS_INITIAL.y2 - MC_CANVAS_INITIAL.y1}
        fill={MC_CANVAS_FILL}
        fillOpacity={0}
      />
      {/* 四条边界线：横线贯穿全宽，竖线贯穿全高 */}
      <line
        id="mc-line-top"
        className="mc-main-line"
        x1={0} y1={MC_CANVAS_INITIAL.y1} x2={VW} y2={MC_CANVAS_INITIAL.y1}
        stroke={MC_CANVAS_LINE_INITIAL}
        strokeWidth={MC_CANVAS_STROKE_WIDTH}
      />
      <line
        id="mc-line-bottom"
        className="mc-main-line"
        x1={0} y1={MC_CANVAS_INITIAL.y2} x2={VW} y2={MC_CANVAS_INITIAL.y2}
        stroke={MC_CANVAS_LINE_INITIAL}
        strokeWidth={MC_CANVAS_STROKE_WIDTH}
      />
      <line
        id="mc-line-left"
        className="mc-main-line"
        x1={MC_CANVAS_INITIAL.x1} y1={0} x2={MC_CANVAS_INITIAL.x1} y2={VH}
        stroke={MC_CANVAS_LINE_INITIAL}
        strokeWidth={MC_CANVAS_STROKE_WIDTH}
      />
      <line
        id="mc-line-right"
        className="mc-main-line"
        x1={MC_CANVAS_INITIAL.x2} y1={0} x2={MC_CANVAS_INITIAL.x2} y2={VH}
        stroke={MC_CANVAS_LINE_INITIAL}
        strokeWidth={MC_CANVAS_STROKE_WIDTH}
      />
    </svg>
  );
}
