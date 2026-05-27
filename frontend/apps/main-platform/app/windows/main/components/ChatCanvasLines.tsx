"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  VW,
  VH,
  MAIN_CANVAS_INITIAL,
  MAIN_CANVAS_EXPANDED,
  MAIN_CANVAS_MENU_OPEN,
  MAIN_CANVAS_EXTRA_LINE_INITIAL_X,
  MAIN_CANVAS_EXTRA_LINE_EXPANDED_X,
  MAIN_CANVAS_FILL,
  MAIN_CANVAS_LINE_ACTIVE,
  MAIN_CANVAS_LINE_INITIAL,
  MAIN_CANVAS_STROKE_WIDTH,
} from "../../shared/coords";
import { LINE_DRAW_EASE } from "../../shared/animation";

type Coords = { x1: number; x2: number; y1: number; y2: number; extraX: number };
type ChatMode = "local" | "global";

export interface ChatCanvasLinesProps {
  menuOpen?: boolean;
  mode?: ChatMode;
  onComplete?: () => void;
}

// 将四条线的 SVG 属性同步到当前 coords
function syncLines(svg: SVGSVGElement, c: Coords) {
  const set = (id: string, attrs: Record<string, number>) => {
    const el = svg.querySelector<SVGLineElement>(`#cc-${id}`);
    if (el) {
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    }
  };
  // 竖线贯穿全高，横线贯穿全宽——四线始终延伸到 SVG 边界，但画布 rect 仅是四线交叉区域
  set("line-left",   { x1: c.x1, y1: 0,   x2: c.x1, y2: VH });
  set("line-right",  { x1: c.x2, y1: 0,   x2: c.x2, y2: VH });
  set("line-top",    { x1: 0,   y1: c.y1,  x2: VW,   y2: c.y1 });
  set("line-bottom", { x1: 0,   y1: c.y2,  x2: VW,   y2: c.y2 });
}

// 将画布填充 rect 同步到当前 coords（rect 即四线围成区域）
function syncRect(rect: SVGRectElement | null, c: Coords) {
  if (!rect) return;
  rect.setAttribute("x", String(c.x1));
  rect.setAttribute("y", String(c.y1));
  rect.setAttribute("width", String(Math.max(0, c.x2 - c.x1)));
  rect.setAttribute("height", String(Math.max(0, c.y2 - c.y1)));
}

// 同步左侧第五竖线位置
function syncExtraLine(line: SVGLineElement | null, extraX: number) {
  if (!line) return;
  line.setAttribute("x1", String(extraX));
  line.setAttribute("x2", String(extraX));
}

// 同步左侧填充矩形（x=0..extraX，y=y1..y2）
function syncRectLeft(rect: SVGRectElement | null, c: Coords) {
  if (!rect) return;
  rect.setAttribute("x", "0");
  rect.setAttribute("y", String(c.y1));
  rect.setAttribute("width", String(Math.max(0, c.extraX)));
  rect.setAttribute("height", String(Math.max(0, c.y2 - c.y1)));
}

export function ChatCanvasLines({ menuOpen = false, mode = "local", onComplete }: ChatCanvasLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // 单一坐标源，所有线条和 rect 由此驱动
  const coordsRef = useRef<Coords>({ ...MAIN_CANVAS_INITIAL, extraX: MAIN_CANVAS_EXTRA_LINE_INITIAL_X });

  // 入场动画已完成标志：菜单联动补间必须等入场结束后才能介入
  const entryDoneRef = useRef(false);

  // 菜单联动补间，保存引用以便 kill 重播
  const menuTweenRef = useRef<gsap.core.Tween | null>(null);

  // 入场完成后待执行的菜单目标（入场期间菜单已打开时，完成后补一次平移）
  const pendingMenuOpenRef = useRef<boolean | null>(null);

  // onComplete 回调用 ref 稳定引用
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // ─── 入场动画（画线 + 扩张）────────────────────────────
  // 同步执行，与第一窗口 LoginIntroWindow 一致
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const coords = coordsRef.current;
    const isGlobal = mode === "global";
    const activeStroke = isGlobal ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_ACTIVE;
    const initialStroke = isGlobal ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_INITIAL;

    const lineLeft   = svg.querySelector<SVGLineElement>("#cc-line-left");
    const lineRight  = svg.querySelector<SVGLineElement>("#cc-line-right");
    const lineTop    = svg.querySelector<SVGLineElement>("#cc-line-top");
    const lineBottom = svg.querySelector<SVGLineElement>("#cc-line-bottom");
    const lineLeftExtra = svg.querySelector<SVGLineElement>("#cc-line-left-extra");
    const fillRect   = svg.querySelector<SVGRectElement>("#cc-fill-rect");
    const fillRectLeft = svg.querySelector<SVGRectElement>("#cc-fill-rect-left");

    const lines = [lineTop, lineBottom, lineLeft, lineRight, lineLeftExtra].filter(Boolean) as SVGLineElement[];
    if (lines.length === 0) return;

    // 初始化：线条为白色，dashoffset=全长（不可见），rect 与初始 coords 一致但透明
    lines.forEach((line) => {
      const len = line.getTotalLength();
      gsap.set(line, {
        strokeDasharray: len,
        strokeDashoffset: len,
        stroke: initialStroke,
        opacity: 1,
      });
    });

    if (fillRect) {
      syncRect(fillRect, coords);
      gsap.set(fillRect, { fillOpacity: 0 });
    }
    if (fillRectLeft) {
      syncRectLeft(fillRectLeft, coords);
      gsap.set(fillRectLeft, { fillOpacity: 0 });
    }

    // 阶段1：画线（与第一窗口 LoginIntroWindow 一致：duration 1.08，stagger 0.08，慢快慢 ease）
    const tl = gsap.timeline();

    tl.to(lines, {
      strokeDashoffset: 0,
      duration: 1.08,
      stagger: 0.08,
      ease: LINE_DRAW_EASE,
    }, 0);

    // 阶段2：变色 + 扩张 + 填充，在五条线绘制完成后立即开始（0.32 + 1.08 = 1.40）
    const lineDrawEnd = 0.32 + 1.08;
    tl.to(lines, {
      stroke: activeStroke,
      duration: 0.5,
      ease: "power2.out",
    }, lineDrawEnd);

    tl.set(lines, {
      clearProps: "strokeDasharray,strokeDashoffset",
    }, lineDrawEnd + 0.5);

    if (fillRect) {
      tl.to(fillRect, {
        fillOpacity: 1,
        duration: 0.18,
        ease: "power2.out",
      }, lineDrawEnd);
    }

    if (fillRectLeft) {
      tl.to(fillRectLeft, {
        fillOpacity: 1,
        duration: 0.18,
        ease: "power2.out",
      }, lineDrawEnd);
    }

    tl.to(coords, {
      ...MAIN_CANVAS_EXPANDED,
      extraX: MAIN_CANVAS_EXTRA_LINE_EXPANDED_X,
      duration: 0.5,
      ease: "power3.inOut",
      onUpdate: () => {
        syncLines(svg, coords);
        syncRect(fillRect, coords);
        syncExtraLine(lineLeftExtra, coords.extraX);
        syncRectLeft(fillRectLeft, coords);
      },
      onComplete: () => {
        entryDoneRef.current = true;
        if (pendingMenuOpenRef.current !== null) {
          const target = pendingMenuOpenRef.current
            ? MAIN_CANVAS_MENU_OPEN
            : MAIN_CANVAS_EXPANDED;
          pendingMenuOpenRef.current = null;
          menuTweenRef.current?.kill();
          menuTweenRef.current = gsap.to(coords, {
            x1: target.x1,
            x2: target.x2,
            // y1/y2 保持全屏（0 / VH），不受菜单影响
            duration: 0.45,
            ease: "power3.inOut",
            onUpdate: () => {
              syncLines(svg, coords);
              syncRect(fillRect, coords);
              syncExtraLine(lineLeftExtra, coords.extraX);
              syncRectLeft(fillRectLeft, coords);
            },
          });
        }
        onCompleteRef.current?.();
      },
    }, lineDrawEnd);

    return () => {
      tl.kill();
    };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const nextStroke = mode === "global" ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_ACTIVE;
    const lines = svg.querySelectorAll<SVGLineElement>(".cc-main-line");
    lines.forEach((line) => {
      line.setAttribute("stroke", nextStroke);
    });
  }, [mode]);

  // ─── 菜单联动：监听 menuOpen 变化，平移 x1/x2 ──────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // 入场动画尚未完成：记录最新意图，待入场结束后由 onComplete 补执行
    if (!entryDoneRef.current) {
      pendingMenuOpenRef.current = menuOpen;
      return;
    }

    const coords = coordsRef.current;
    const fillRect = svg.querySelector<SVGRectElement>("#cc-fill-rect");
    const fillRectLeft = svg.querySelector<SVGRectElement>("#cc-fill-rect-left");
    const lineLeftExtra = svg.querySelector<SVGLineElement>("#cc-line-left-extra");

    menuTweenRef.current?.kill();

    const target = menuOpen ? MAIN_CANVAS_MENU_OPEN : MAIN_CANVAS_EXPANDED;

    menuTweenRef.current = gsap.to(coords, {
      x1: target.x1,
      x2: target.x2,
      // y1/y2 保持全屏（0 / VH），不受菜单影响
      duration: 0.45,
      ease: "power3.inOut",
      onUpdate: () => {
        syncLines(svg, coords);
        syncRect(fillRect, coords);
        syncExtraLine(lineLeftExtra, coords.extraX);
        syncRectLeft(fillRectLeft, coords);
      },
    });

    return () => {
      menuTweenRef.current?.kill();
    };
  }, [menuOpen]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid slice"
      className={`main-window-canvas-svg${mode === "global" ? " main-window-canvas-svg--global" : ""}`}
      data-mode={mode}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cc-global-neon-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#48A7FF" />
          <stop offset="52%" stopColor="#7A6CFF" />
          <stop offset="100%" stopColor="#9D4DFF" />
        </linearGradient>
      </defs>

      {/* 左侧填充 rect：在主 rect 之下，竖线同层 */}
      <rect
        id="cc-fill-rect-left"
        x={0}
        y={MAIN_CANVAS_INITIAL.y1}
        width={MAIN_CANVAS_EXTRA_LINE_INITIAL_X}
        height={MAIN_CANVAS_INITIAL.y2 - MAIN_CANVAS_INITIAL.y1}
        fill={MAIN_CANVAS_FILL}
        fillOpacity={0}
      />

      {/* 画布填充 rect：必须在线条之下，四线始终覆盖在上方 */}
      <rect
        id="cc-fill-rect"
        x={MAIN_CANVAS_INITIAL.x1}
        y={MAIN_CANVAS_INITIAL.y1}
        width={MAIN_CANVAS_INITIAL.x2 - MAIN_CANVAS_INITIAL.x1}
        height={MAIN_CANVAS_INITIAL.y2 - MAIN_CANVAS_INITIAL.y1}
        fill={MAIN_CANVAS_FILL}
        fillOpacity={0}
      />

      {/* 四条边界线：渲染在 rect 之上，保证线条始终可见 */}
      <line
        id="cc-line-top"
        className={`cc-main-line${mode === "global" ? " cc-main-line--global" : ""}`}
        x1={0}
        y1={MAIN_CANVAS_INITIAL.y1}
        x2={VW}
        y2={MAIN_CANVAS_INITIAL.y1}
        stroke={mode === "global" ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_INITIAL}
        strokeWidth={MAIN_CANVAS_STROKE_WIDTH}
      />
      <line
        id="cc-line-bottom"
        className={`cc-main-line${mode === "global" ? " cc-main-line--global" : ""}`}
        x1={0}
        y1={MAIN_CANVAS_INITIAL.y2}
        x2={VW}
        y2={MAIN_CANVAS_INITIAL.y2}
        stroke={mode === "global" ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_INITIAL}
        strokeWidth={MAIN_CANVAS_STROKE_WIDTH}
      />
      <line
        id="cc-line-left-extra"
        className={`cc-main-line${mode === "global" ? " cc-main-line--global" : ""}`}
        x1={MAIN_CANVAS_EXTRA_LINE_INITIAL_X}
        y1={0}
        x2={MAIN_CANVAS_EXTRA_LINE_INITIAL_X}
        y2={VH}
        stroke={mode === "global" ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_INITIAL}
        strokeWidth={MAIN_CANVAS_STROKE_WIDTH}
      />
      <line
        id="cc-line-left"
        className={`cc-main-line${mode === "global" ? " cc-main-line--global" : ""}`}
        x1={MAIN_CANVAS_INITIAL.x1}
        y1={0}
        x2={MAIN_CANVAS_INITIAL.x1}
        y2={VH}
        stroke={mode === "global" ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_INITIAL}
        strokeWidth={MAIN_CANVAS_STROKE_WIDTH}
      />
      <line
        id="cc-line-right"
        className={`cc-main-line${mode === "global" ? " cc-main-line--global" : ""}`}
        x1={MAIN_CANVAS_INITIAL.x2}
        y1={0}
        x2={MAIN_CANVAS_INITIAL.x2}
        y2={VH}
        stroke={mode === "global" ? "url(#cc-global-neon-grad)" : MAIN_CANVAS_LINE_INITIAL}
        strokeWidth={MAIN_CANVAS_STROKE_WIDTH}
      />
    </svg>
  );
}
