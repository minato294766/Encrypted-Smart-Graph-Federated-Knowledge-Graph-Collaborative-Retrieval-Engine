"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from "react";
import { gsap } from "gsap";
import { MACRO_NODES } from "../macroData";

/* ── 时间段类型 ── */
type Period = "最近" | "24小时" | "7天内" | "30天内";
const PERIODS: Period[] = ["最近", "24小时", "7天内", "30天内"];

const NODE_SERIES_ALIASES: Record<string, string> = {
  "n-registrar": "node-2",
  "n-gym": "node-3",
  "n-laoshan": "node-4",
  "n-library": "node-5",
};

const NODE_DISPLAY_LABELS: Record<string, string> = {
  "node-2": "党史教育中心",
  "node-3": "马克思理论教研室",
  "node-4": "法学教研室",
  "node-5": "图书馆-红色经典区",
  "n-registrar": "党史教育中心",
  "n-gym": "马克思理论教研室",
  "n-laoshan": "法学教研室",
  "n-library": "图书馆-红色经典区",
  "n-newteach": "语言实践中心",
  "n-simstreet": "大数据教研室",
};

const NODE_CLOUD_KEY_ALIASES: Record<string, string> = {
  "n-registrar": "node-2",
  "n-gym": "node-3",
  "n-laoshan": "node-4",
  "n-library": "node-5",
};

const NODE_PERIOD_SERIES: Record<string, Record<Period, number[]>> = {
  "node-current": {
    "最近": [28, 55, 37, 63, 42],
    "24小时": [22, 48, 36, 61, 33, 67, 45],
    "7天内": [31, 58, 44, 69, 41, 73, 52],
    "30天内": [35, 63, 47, 71, 54, 76, 60],
  },
  "node-center-red": {
    "最近": [72, 88, 74, 92, 79],
    "24小时": [68, 90, 73, 95, 76, 97, 82],
    "7天内": [70, 89, 75, 93, 78, 96, 84],
    "30天内": [73, 91, 77, 94, 81, 98, 86],
  },
  "node-2": {
    "最近": [24, 46, 31, 57, 35],
    "24小时": [20, 44, 29, 55, 33, 61, 38],
    "7天内": [27, 49, 34, 58, 37, 63, 42],
    "30天内": [30, 53, 38, 61, 44, 66, 49],
  },
  "node-3": {
    "最近": [34, 67, 41, 74, 46],
    "24小时": [29, 62, 37, 78, 43, 82, 51],
    "7天内": [36, 69, 45, 76, 52, 81, 58],
    "30天内": [40, 72, 49, 79, 56, 84, 63],
  },
  "node-4": {
    "最近": [52, 38, 59, 35, 63],
    "24小时": [55, 36, 61, 33, 66, 39, 70],
    "7天内": [58, 41, 64, 37, 69, 44, 73],
    "30天内": [60, 45, 67, 40, 72, 48, 76],
  },
  "node-5": {
    "最近": [18, 39, 24, 46, 29],
    "24小时": [15, 36, 22, 49, 27, 53, 33],
    "7天内": [20, 41, 26, 52, 31, 57, 37],
    "30天内": [24, 45, 30, 56, 35, 61, 42],
  },
  "n-simstreet": {
    "最近": [38, 72, 45, 81, 53],
    "24小时": [31, 69, 42, 84, 48, 89, 57],
    "7天内": [36, 74, 47, 86, 54, 91, 61],
    "30天内": [41, 77, 52, 88, 59, 93, 66],
  },
  "n-newteach": {
    "最近": [26, 49, 33, 58, 39],
    "24小时": [23, 46, 31, 61, 37, 66, 44],
    "7天内": [28, 52, 36, 64, 42, 69, 49],
    "30天内": [33, 56, 41, 67, 47, 72, 54],
  },
};

function buildValueDomain(values: number[]): { min: number; max: number; ticks: [number, number, number] } {
  if (!values.length) {
    return { min: 0, max: 100, ticks: [100, 50, 0] };
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(8, rawMax - rawMin);
  const padding = Math.max(4, Math.round(spread * 0.24));

  let min = Math.max(0, rawMin - padding);
  let max = Math.min(100, rawMax + padding);

  if (max - min < 12) {
    const center = (rawMin + rawMax) / 2;
    min = Math.max(0, center - 6);
    max = Math.min(100, center + 6);
  }

  const roundedMin = Math.floor(min);
  const roundedMax = Math.ceil(max);
  const mid = Math.round((roundedMin + roundedMax) / 2);

  return {
    min: roundedMin,
    max: roundedMax,
    ticks: [roundedMax, mid, roundedMin],
  };
}

function clampPercent(value: number): number {
  return Math.max(5, Math.min(98, value));
}

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function buildIrregularSeries(baseValues: number[], seedKey: string): number[] {
  if (!baseValues.length) return [];

  const random = createSeededRandom(hashStringToSeed(seedKey));
  const values: number[] = [];
  let prev = clampPercent(baseValues[0] + randomBetween(random, -10, 10));
  values.push(Math.round(prev));

  for (let i = 1; i < baseValues.length; i += 1) {
    const base = baseValues[i];
    const drift = randomBetween(random, -8, 8);
    const step = randomBetween(random, -14, 14);
    const shock = random() < 0.22 ? randomBetween(random, -18, 18) : 0;
    const candidate = base * 0.45 + prev * 0.55 + drift + step + shock;
    prev = clampPercent(candidate);
    values.push(Math.round(prev));
  }

  return values;
}

function buildTimeLabels(period: Period, count: number, now: Date): string[] {
  if (count <= 0) return [];

  if (period === "最近") {
    const stepHours = 1;
    return Array.from({ length: count }, (_, index) => {
      const offset = count - 1 - index;
      const d = new Date(now.getTime() - offset * stepHours * 3600000);
      return `${d.getHours()}:00`;
    });
  }

  if (period === "24小时") {
    const stepHours = Math.max(1, Math.floor(24 / Math.max(1, count - 1)));
    return Array.from({ length: count }, (_, index) => {
      const offset = count - 1 - index;
      const d = new Date(now.getTime() - offset * stepHours * 3600000);
      return `${d.getHours()}:00`;
    });
  }

  if (period === "7天内") {
    return Array.from({ length: count }, (_, index) => {
      const offset = count - 1 - index;
      const d = new Date(now.getTime() - offset * 24 * 3600000);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
  }

  const stepDays = Math.max(1, Math.floor(30 / Math.max(1, count - 1)));
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const d = new Date(now.getTime() - offset * stepDays * 24 * 3600000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
}

/* ── 不同时间段的配置：颜色 & 渐变 ── */
const PERIOD_CONFIGS: Record<Period, { stroke: string; gradient: [string, string] }> = {
  "最近": { stroke: "#0891b2", gradient: ["#22d3ee", "#06b6d4"] },
  "24小时": { stroke: "#6366f1", gradient: ["#818cf8", "#4f46e5"] },
  "7天内": { stroke: "#10b981", gradient: ["#34d399", "#059669"] },
  "30天内": { stroke: "#f43f5e", gradient: ["#fb7185", "#e11d48"] },
};

interface D4VisualizationProps {
  /** 为 true 时开始渲染内部内容（由父组件在画布完全展开后传入） */
  visible: boolean;
  activeSectorId: string;
  selectedNodeId: string | null;
  selfNodeName?: string;
}

interface DataPoint {
  time: string;
  value: number; // 0 - 100
}

export function D4Visualization({ visible, activeSectorId, selectedNodeId, selfNodeName }: D4VisualizationProps) {
  const [period, setPeriod] = useState<Period>("最近");
  const [animKey, setAnimKey] = useState(0);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const pointsRef = useRef<(SVGCircleElement | null)[]>([]);
  const labelsRef = useRef<SVGGElement>(null);
  const animationTlRef = useRef<gsap.core.Timeline | null>(null);

  const [hasAnimatedFirstTime, setHasAnimatedFirstTime] = useState(false);

  const resolveSeriesNodeId = useCallback((nodeId: string | null | undefined): string => {
    if (!nodeId) return "node-current";
    const resolved = NODE_SERIES_ALIASES[nodeId] ?? nodeId;
    return NODE_PERIOD_SERIES[resolved] ? resolved : "node-current";
  }, []);

  const [displayNodeId, setDisplayNodeId] = useState<string>(() =>
    resolveSeriesNodeId(selectedNodeId ?? activeSectorId),
  );

  useEffect(() => {
    if (!selectedNodeId) return;
    setDisplayNodeId(resolveSeriesNodeId(selectedNodeId));
  }, [selectedNodeId, resolveSeriesNodeId]);

  const resolvedNodeSeriesId = useMemo(
    () => resolveSeriesNodeId(displayNodeId),
    [displayNodeId, resolveSeriesNodeId],
  );
  const resolvedSelfNodeName = selfNodeName?.trim() || "图书馆-法律文献区";

  const nodeLabel = useMemo(() => {
    const focusNodeId = displayNodeId;
    if (focusNodeId === "node-current" || focusNodeId === "node-center-red") {
      return resolvedSelfNodeName;
    }

    if (NODE_DISPLAY_LABELS[focusNodeId]) {
      return NODE_DISPLAY_LABELS[focusNodeId];
    }

    const aliasedNodeId = NODE_CLOUD_KEY_ALIASES[focusNodeId];
    if (aliasedNodeId && NODE_DISPLAY_LABELS[aliasedNodeId]) {
      return NODE_DISPLAY_LABELS[aliasedNodeId];
    }

    return (
      MACRO_NODES.find((item) => item.id === focusNodeId)?.label ??
      MACRO_NODES.find((item) => item.id === activeSectorId)?.label ??
      NODE_DISPLAY_LABELS[activeSectorId] ??
      activeSectorId
    );
  }, [displayNodeId, activeSectorId, resolvedSelfNodeName]);

  useEffect(() => {
    if (!visible) return;

    const container = chartContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const syncSize = () => {
      const rawWidth = Math.round(container.clientWidth);
      const rawHeight = Math.round(container.clientHeight);
      if (rawWidth <= 0 || rawHeight <= 0) {
        return;
      }

      const nextWidth = Math.max(320, rawWidth);
      const nextHeight = Math.max(220, rawHeight);
      setChartSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    const scheduleSync = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(syncSize);
    };

    syncSize();

    const observer = new ResizeObserver(scheduleSync);
    observer.observe(container);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [visible]);

  // 1. 根据当前节点 + 时间段生成模拟数据
  const data: DataPoint[] = useMemo(() => {
    const now = new Date();
    const baseValues =
      NODE_PERIOD_SERIES[resolvedNodeSeriesId]?.[period] ?? NODE_PERIOD_SERIES["node-current"][period];
    const values = buildIrregularSeries(baseValues, `${resolvedNodeSeriesId}:${period}`);
    const labels = buildTimeLabels(period, values.length, now);

    return values.map((value, index) => ({
      value,
      time: labels[index] ?? `${index + 1}`,
    }));
  }, [period, resolvedNodeSeriesId]);

  // 2. 坐标计算（根据容器实时自适应）
  const width = chartSize.width;
  const height = chartSize.height;
  const hasMeasuredSize = width > 0 && height > 0;
  const padding = useMemo(() => {
    const horizontal = Math.round(Math.max(28, Math.min(56, width * 0.1)));
    const top = Math.round(Math.max(18, Math.min(34, height * 0.1)));
    const bottom = Math.round(Math.max(40, Math.min(68, height * 0.17)));
    const right = Math.round(Math.max(26, Math.min(54, width * 0.09)));
    return { top, right, bottom, left: horizontal };
  }, [width, height]);

  const chartW = Math.max(1, width - padding.left - padding.right);
  const chartH = Math.max(1, height - padding.top - padding.bottom);
  const axisFontSize = Math.max(11, Math.min(14, Math.round(Math.min(width, height) * 0.03)));
  const lineStrokeWidth = Math.max(2.6, Math.min(4, width * 0.0048));
  const pointRadius = Math.max(4.6, Math.min(6.5, width * 0.008));
  const pointStrokeWidth = Math.max(2.2, Math.min(3.5, width * 0.0043));

  const valueDomain = useMemo(() => buildValueDomain(data.map((item) => item.value)), [data]);
  const valueRange = Math.max(1, valueDomain.max - valueDomain.min);

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const getY = (v: number) =>
    padding.top + chartH - ((v - valueDomain.min) / valueRange) * chartH;
  const getBaseY = () => padding.top + chartH;

  // 3. 生成贝塞尔曲线路径
  const curvePath = useMemo(() => {
    if (data.length < 2) return "";
    let d = `M ${getX(0)} ${getY(data[0].value)}`;

    for (let i = 0; i < data.length - 1; i++) {
        const x1 = getX(i);
        const y1 = getY(data[i].value);
        const x2 = getX(i + 1);
        const y2 = getY(data[i + 1].value);

        const cp1x = x1 + (x2 - x1) * 0.4;
        const cp2x = x1 + (x2 - x1) * 0.6;
        const cp1y = y1;
        const cp2y = y2;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }
    return d;
  }, [data, chartW, chartH, padding.left, padding.top]);

  const areaPath = useMemo(() => {
    if (!curvePath) return "";
    return `${curvePath} L ${getX(data.length - 1)} ${getBaseY()} L ${getX(0)} ${getBaseY()} Z`;
  }, [curvePath, data, chartW, padding.left, padding.top, chartH]);

  const currentConfig = PERIOD_CONFIGS[period];

  // 4. GSAP 动画执行函数
  const runAnimation = useCallback((isFirstTime = false) => {
    if (!rootRef.current) return;

    animationTlRef.current?.kill();

    const tl = gsap.timeline();
    animationTlRef.current = tl;
    const validPoints = pointsRef.current.filter(Boolean);
    const pathLength = pathRef.current?.getTotalLength() ?? 0;
    const hasDrawablePath = pathLength > 0;

    // 如果是切换，先在布局阶段把新曲线置为隐藏初态，避免先闪现一帧
    if (pathRef.current) {
      gsap.set(pathRef.current, {
        opacity: 0,
        strokeDasharray: hasDrawablePath ? pathLength : undefined,
        strokeDashoffset: hasDrawablePath ? pathLength : 0,
      });
    }

    if (areaRef.current) {
      gsap.set(areaRef.current, { opacity: 0 });
    }

    if (validPoints.length) {
      gsap.set(validPoints, { opacity: 0, scale: 0, transformOrigin: "center center" });
    }

    if (!isFirstTime) {
      if (headerRef.current) {
        gsap.set(headerRef.current, { autoAlpha: 1, y: 0 });
      }
      if (selectorRef.current) {
        gsap.set(selectorRef.current, { autoAlpha: 1, y: 0 });
      }
    }

    // 标题与选择器淡入 (仅首次)
    if (isFirstTime) {
      if (headerRef.current) {
        tl.fromTo(
          headerRef.current,
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" },
          0,
        );
      }
      if (selectorRef.current) {
        tl.fromTo(
          selectorRef.current,
          { autoAlpha: 0, y: 6 },
          { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" },
          0.1,
        );
      }
    }

    // 坐标轴标签动画
    if (labelsRef.current) {
        const children = labelsRef.current.children;
        if (isFirstTime) {
           tl.to(children, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.03, ease: "power2.out" }, 0.15);
        } else {
           tl.fromTo(children,
              { autoAlpha: 0, x: -10 },
              { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.03, ease: "power2.out" },
              0
           );
        }
    }

    // 曲线与面积 reveal 动画（避免 scale 造成 SVG 坐标错位）
    const curveStartAt = isFirstTime ? 0.4 : 0.2;
    if (pathRef.current) {
      tl.to(
        pathRef.current,
        hasDrawablePath
          ? { opacity: 1, strokeDashoffset: 0, duration: 0.72, ease: "power3.out" }
          : { opacity: 1, duration: 0.3, ease: "power2.out" },
        curveStartAt,
      );
    }

    if (areaRef.current) {
      tl.to(
        areaRef.current,
        { opacity: 1, duration: 0.48, ease: "power2.out" },
        curveStartAt + 0.06,
      );
    }

    // 数据点弹出
    if (validPoints.length) {
        tl.fromTo(validPoints,
            { scale: 0, opacity: 0, transformOrigin: "center center" },
            { scale: 1, opacity: 1, duration: 0.4, stagger: 0.08, ease: "back.out(1.7)" },
            isFirstTime ? 0.7 : 0.5
        );
    }
  }, [chartH, padding.top]);

  const runAnimationRef = useRef(runAnimation);
  useEffect(() => {
    runAnimationRef.current = runAnimation;
  }, [runAnimation]);

  useLayoutEffect(() => {
    if (!visible || !hasMeasuredSize) return;
    if (!hasAnimatedFirstTime) {
      setHasAnimatedFirstTime(true);
      runAnimationRef.current(true);
    } else {
      runAnimationRef.current(false);
    }
  }, [visible, hasMeasuredSize, animKey, hasAnimatedFirstTime, resolvedNodeSeriesId]);

  useEffect(() => {
    return () => {
      animationTlRef.current?.kill();
    };
  }, []);

  const handlePeriodChange = (p: Period) => {
    if (p === period) return;
    setPeriod(p);
    setAnimKey(prev => prev + 1);
  };

  if (!visible) return null;

  return (
    <div ref={rootRef} className="d4viz-root" aria-label={`${nodeLabel} 数据库价值监测`}>
      {/* ── 标题栏 (仅标题) ── */}
      <header ref={headerRef} className="d1tl-header d4viz-header">
        <span className="d1tl-header-dot d4viz-dot" />
        <span className="d1tl-header-title">数据库价值监测 · {nodeLabel}</span>
      </header>

      {/* ── 时间段选择器独立行 ── */}
      <div ref={selectorRef} className="d4viz-period-row">
        <div className="d4viz-period-selector" role="group" aria-label="时间段选择">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`d4viz-period-btn${p === period ? " d4viz-period-btn--active" : ""}`}
              onClick={() => handlePeriodChange(p)}
              aria-pressed={p === period}
            >
              <span className="d4viz-period-btn-text">{p}</span>
              {p === period && <span className="d4viz-period-btn-bar" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── SVG 曲线区域 (填满剩余空间) ── */}
      <div ref={chartContainerRef} className="d4viz-chart-container">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="d4viz-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="d4-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentConfig.gradient[0]} stopOpacity="0.6" />
              <stop offset="100%" stopColor={currentConfig.gradient[1]} stopOpacity="0" />
            </linearGradient>
            <filter id="d4-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 轴组 */}
          <g ref={labelsRef} className="d4viz-axis-group">
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={getBaseY()} stroke="rgba(30,25,25,0.06)" strokeWidth="1" />
            <line x1={padding.left} y1={getBaseY()} x2={width - padding.right} y2={getBaseY()} stroke="rgba(30,25,25,0.06)" strokeWidth="1" />

            {data.map((pt, i) => (
              <text
                key={`${resolvedNodeSeriesId}-${period}-x-${i}`}
                x={getX(i)}
                y={getBaseY() + axisFontSize * 1.6}
                textAnchor="middle"
                className="d4viz-axis-text"
                style={{ fontSize: `${axisFontSize}px` }}
              >
                {pt.time}
              </text>
            ))}

            {valueDomain.ticks.map((v) => (
              <text
                key={`y-${v}`}
                x={padding.left - Math.max(12, axisFontSize * 0.9)}
                y={getY(v) + axisFontSize * 0.34}
                textAnchor="end"
                className="d4viz-axis-text"
                style={{ fontSize: `${axisFontSize}px` }}
              >
                {v}%
              </text>
            ))}
          </g>

          {/* 填充区域 */}
          <path
            ref={areaRef}
            d={areaPath}
            fill="url(#d4-gradient)"
          />

          {/* 曲线 */}
          <path
            ref={pathRef}
            d={curvePath}
            fill="none"
            stroke={currentConfig.stroke}
            strokeWidth={lineStrokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#d4-glow)"
          />

          {/* 数据点 */}
          {data.map((pt, i) => (
            <circle
              key={`${resolvedNodeSeriesId}-${period}-p-${i}`}
              ref={el => { pointsRef.current[i] = el; }}
              cx={getX(i)}
              cy={getY(pt.value)}
              r={pointRadius}
              fill="#ffffff"
              stroke={currentConfig.stroke}
              strokeWidth={pointStrokeWidth}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
