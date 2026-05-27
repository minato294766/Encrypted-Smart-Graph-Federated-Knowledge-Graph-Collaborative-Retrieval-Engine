"use client";

import { memo, useRef, useState, useEffect, useCallback, useMemo } from "react";
import { gsap } from "gsap";

/* ── 时间段类型 ── */
type Period = "当天" | "本周" | "本月" | "本季" | "本年";
const PERIODS: Period[] = ["当天", "本周", "本月", "本季", "本年"];
const SELF_NODE_PLACEHOLDER = "__SELF_NODE__";

/* ── 颜色：从 #6367FF → #C9BEFF，5 档渐变 ── */
const BAR_COLORS = [
  "#6367FF",
  "#6E5CFF",
  "#7C50FF",
  "#8E44FF",
  "#A855F7",
];

/* ── API response type ── */
interface SearchFrequencyItem {
  user_id: number;
  username: string;
  query_count: number;
}

async function fetchSearchFrequency(period: Period): Promise<SearchFrequencyItem[]> {
  const miaRagUrl = process.env.NEXT_PUBLIC_MIA_RAG_AUTH_URL?.trim();
  if (!miaRagUrl) return [];

  const periodMap: Record<Period, string> = {
    "当天": "today",
    "本周": "week",
    "本月": "month",
    "本季": "quarter",
    "本年": "year",
  };

  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("mia_rag_token") : null;
    const res = await fetch(`${miaRagUrl}/api/macro/search-frequency?period=${periodMap[period]}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { rankings?: SearchFrequencyItem[] };
    return data.rankings ?? [];
  } catch {
    return [];
  }
}

interface D2VisualizationProps {
  visible: boolean;
  selfNodeName?: string;
}

function D2VisualizationImpl({ visible, selfNodeName }: D2VisualizationProps) {
  const [period, setPeriod] = useState<Period>("本月");
  const [animKey, setAnimKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const labelsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const headerRef = useRef<HTMLElement>(null);
  const prevVisibleRef = useRef(false);
  const [apiData, setApiData] = useState<SearchFrequencyItem[]>([]);

  const resolvedSelfNodeName = selfNodeName?.trim() || "图书馆-法律文献区";

  // Fetch real data when period changes
  useEffect(() => {
    if (!visible) return;
    fetchSearchFrequency(period).then(setApiData);
  }, [visible, period]);

  const data = useMemo(() => {
    if (apiData.length > 0) {
      return apiData.slice(0, 5).map((item) => ({
        name: item.username === SELF_NODE_PLACEHOLDER ? resolvedSelfNodeName : item.username,
        value: item.query_count,
      }));
    }
    // Fallback when no API data
    return [
      { name: resolvedSelfNodeName, value: 14 },
      { name: "法学教研室", value: 11 },
      { name: "党史教育中心", value: 8 },
      { name: "语言实践中心", value: 6 },
      { name: "图书馆-红色经典区", value: 4 },
    ];
  }, [apiData, resolvedSelfNodeName]);

  const maxVal = data[0]?.value ?? 1;

  /* ── 动画函数 ── */
  const runAnimation = useCallback(() => {
    const bars = barsRef.current.filter(Boolean) as HTMLDivElement[];
    const labels = labelsRef.current.filter(Boolean) as HTMLSpanElement[];

    if (!bars.length) return;

    bars.forEach((bar, i) => {
      const pct = (data[i].value / maxVal) * 88;
      gsap.set(bar, { width: "0%", opacity: 0 });
      gsap.set(bar, { "--bar-target-width": `${pct}%` } as gsap.TweenVars);
    });
    labels.forEach((lbl) => gsap.set(lbl, { autoAlpha: 0 }));

    const tl = gsap.timeline();

    bars.forEach((bar, i) => {
      const pct = (data[i].value / maxVal) * 88;
      tl.to(
        bar,
        {
          width: `${pct}%`,
          opacity: 1,
          duration: 0.4,
          ease: "power3.out",
        },
        i * 0.07,
      );
    });

    tl.to(
      labels,
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.3,
        stagger: 0.06,
        ease: "power2.out",
      },
      ">",
    );
  }, [data, maxVal]);

  useEffect(() => {
    if (!visible) return;
    if (!prevVisibleRef.current) {
      prevVisibleRef.current = true;
      if (headerRef.current) {
        gsap.to(headerRef.current, { autoAlpha: 1, duration: 0.3, ease: "power2.out" });
      }
    }
    runAnimation();
  }, [visible, animKey, runAnimation]);

  const handlePeriodChange = (p: Period) => {
    if (p === period) return;
    setPeriod(p);
    setAnimKey((k) => k + 1);
  };

  if (!visible) return null;

  return (
    <div ref={rootRef} className="d2viz-root" aria-label="数据库贡献排行图">
      <header ref={headerRef} className="d1tl-header d2viz-header">
        <span className="d1tl-header-dot" />
        <span className="d1tl-header-title">更新贡献排行榜</span>
        <div className="d2viz-period-selector" role="group" aria-label="时间段选择">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`d2viz-period-btn${p === period ? " d2viz-period-btn--active" : ""}`}
              onClick={() => handlePeriodChange(p)}
              aria-pressed={p === period}
            >
              <span className="d2viz-period-btn-text">{p}</span>
              {p === period && <span className="d2viz-period-btn-bar" />}
            </button>
          ))}
        </div>
      </header>

      <div className="d2viz-chart-area">
        {data.map((item, i) => (
          <div key={`${period}-${item.name}`} className="d2viz-row">
            <div className="d2viz-bar-track">
              <div
                ref={(el) => { barsRef.current[i] = el; }}
                className="d2viz-bar"
                style={{ background: BAR_COLORS[i] }}
              />
            </div>
            <span
              ref={(el) => { labelsRef.current[i] = el; }}
              className="d2viz-label"
              style={{ color: BAR_COLORS[i] }}
            >
              {item.name}
              <em className="d2viz-value">{item.value}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const D2Visualization = memo(D2VisualizationImpl);
