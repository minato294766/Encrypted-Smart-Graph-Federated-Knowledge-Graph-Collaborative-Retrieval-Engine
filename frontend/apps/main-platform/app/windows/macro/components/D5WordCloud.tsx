"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MACRO_NODES, NODE_WORD_CLOUDS, WordCloudDatum } from "../macroData";

// ── Fetch real word cloud data from backend ────────────────────────────────
async function fetchWordCloud(): Promise<WordCloudDatum[] | null> {
  const miaRagUrl = process.env.NEXT_PUBLIC_MIA_RAG_AUTH_URL?.trim();
  if (!miaRagUrl) return null;

  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("mia_rag_token") : null;
    const res = await fetch(`${miaRagUrl}/api/macro/word-cloud`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { keywords?: Array<{ word: string; count: number }> };
    if (data.keywords && data.keywords.length > 0) {
      return data.keywords.map((k) => ({ text: k.word, weight: k.count }));
    }
    return null;
  } catch {
    return null;
  }
}

interface D5WordCloudProps {
  visible: boolean;
  activeSectorId: string;
  selectedNodeId: string | null;
  selfNodeName?: string;
}

interface LayoutWord extends WordCloudDatum {
  x: number;
  y: number;
  startY: number;
  rotate: number;
  fontSize: number;
  color: string;
  letterSpacing: number;
  fontWeight: number;
}

interface RectBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const DEFAULT_SIZE = { width: 360, height: 240 };
const CLOUD_PADDING = 18;
const CLOUD_VERTICAL_RATIO = 0.22;
const CLOUD_TEXT_COLORS = ["#6367FF", "#8494FF", "#C9BEFF", "#FFDBFD", "#76D2DB"];

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

function buildWordCloudLayout(source: WordCloudDatum[], width: number, height: number): LayoutWord[] {
  if (!source.length || width <= 0 || height <= 0) return [];

  const sorted = Array.from(
    new Map(source.map((item) => [item.text.trim(), item])).values(),
  )
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.weight - a.weight);
  const maxWeight = sorted[0]?.weight ?? 100;
  const minWeight = sorted[sorted.length - 1]?.weight ?? 0;
  const placedBoxes: RectBox[] = [];
  const boxesByIndex: RectBox[] = [];
  const words: LayoutWord[] = [];
  const deferred: Array<{ word: WordCloudDatum; ratio: number; rotate: number; color: string }> = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const verticalRotations = [90, -90];
  const minFont = Math.max(10, Math.min(12, Math.round(width / 34)));
  const maxFont = Math.min(36, Math.max(minFont + 14, Math.round(width / 10.5)));

  const normalize = (weight: number) => {
    if (maxWeight === minWeight) return 1;
    return Math.pow((weight - minWeight) / (maxWeight - minWeight), 1.08);
  };

  const pickRotation = (index: number, text: string) => {
    if (index < 2) return 0;
    const seed = (index * 31 + text.length * 17) % 100;
    if (seed < CLOUD_VERTICAL_RATIO * 100) {
      return verticalRotations[(index + text.length) % verticalRotations.length];
    }
    return 0;
  };

  const pickColor = (index: number, text: string) =>
    CLOUD_TEXT_COLORS[(index + text.length) % CLOUD_TEXT_COLORS.length];

  const textMetricsCache = new Map<string, { width: number; height: number }>();
  const measurementContext =
    typeof window !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;

  const measureWord = (text: string, fontSize: number) => {
    const key = `${text}__${fontSize.toFixed(2)}`;
    const cached = textMetricsCache.get(key);
    if (cached) return cached;

    let width = fontSize * (text.length * 0.55 + 1.2);
    let height = fontSize * 0.86;

    if (measurementContext) {
      measurementContext.font = `500 ${fontSize}px "DingTalk JinBuTi", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
      const metrics = measurementContext.measureText(text);
      const measuredWidth = metrics.width;
      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.72;
      const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
      width = Math.max(width, measuredWidth);
      height = Math.max(height, ascent + descent);
    }

    const measured = { width, height };
    textMetricsCache.set(key, measured);
    return measured;
  };

  const intersects = (box: RectBox) =>
    placedBoxes.some((b) => !(box.left > b.right || box.right < b.left || box.top > b.bottom || box.bottom < b.top));

  const toRect = (x: number, y: number, fontSize: number, rotate: number, text: string, pad: number): RectBox => {
    const metrics = measureWord(text, fontSize);
    const isVertical = Math.abs(rotate) === 90;
    const w = isVertical ? metrics.height : metrics.width;
    const h = isVertical ? metrics.width : metrics.height;
    return {
      left: x - w / 2 - pad,
      right: x + w / 2 + pad,
      top: y - h / 2 - pad,
      bottom: y + h / 2 + pad,
    };
  };

  const alignToBounds = (x: number, y: number, fontSize: number, rotate: number, text: string, pad: number) => {
    let nextX = x;
    let nextY = y;
    let nextFont = fontSize;
    let box = toRect(nextX, nextY, nextFont, rotate, text, pad);

    const shiftToFit = () => {
      if (box.left < CLOUD_PADDING) nextX += CLOUD_PADDING - box.left;
      if (box.right > width - CLOUD_PADDING) nextX -= box.right - (width - CLOUD_PADDING);
      if (box.top < CLOUD_PADDING) nextY += CLOUD_PADDING - box.top;
      if (box.bottom > height - CLOUD_PADDING) nextY -= box.bottom - (height - CLOUD_PADDING);
      box = toRect(nextX, nextY, nextFont, rotate, text, pad);
    };

    shiftToFit();
    const overflow =
      Math.max(0, CLOUD_PADDING - box.left) +
      Math.max(0, box.right - (width - CLOUD_PADDING)) +
      Math.max(0, CLOUD_PADDING - box.top) +
      Math.max(0, box.bottom - (height - CLOUD_PADDING));

    if (overflow > 0 && nextFont > minFont) {
      const shrinkScale = Math.max(0.8, 1 - overflow / Math.max(width, height));
      nextFont = Math.max(minFont, nextFont * shrinkScale);
      box = toRect(nextX, nextY, nextFont, rotate, text, pad);
      shiftToFit();
    }

    return { x: nextX, y: nextY, fontSize: nextFont, box };
  };

  sorted.forEach((word, index) => {
    const ratio = normalize(word.weight);
    const baseFontSize = minFont + ratio * (maxFont - minFont);
    const rotate = pickRotation(index, word.text);
    const color = pickColor(index, word.text);
    let found = false;
    let placedX = centerX;
    let placedY = centerY;
    let placedFont = baseFontSize;
    let placedBox: RectBox | null = null;

    for (let shrink = 0; shrink <= 8 && !found; shrink += 1) {
      const fontSize = Math.max(minFont, baseFontSize * (1 - shrink * 0.09));
      const maxAttempts = index < 6 ? 1500 : 1000;
      for (let step = 0; step < maxAttempts && !found; step += 1) {
        const theta = step * 0.27 + index * 0.63;
        const radius = 1 + step * 0.74;
        const x = centerX + Math.cos(theta) * radius * 1.04;
        const y = centerY + Math.sin(theta) * radius * 0.78;
        const bounded = alignToBounds(x, y, fontSize, rotate, word.text, index < 6 ? 4 : 2.5);
        const box = bounded.box;
        const inside =
          box.left >= CLOUD_PADDING &&
          box.right <= width - CLOUD_PADDING &&
          box.top >= CLOUD_PADDING &&
          box.bottom <= height - CLOUD_PADDING;
        if (inside && !intersects(box)) {
          placedBox = box;
          placedX = bounded.x;
          placedY = bounded.y;
          placedFont = bounded.fontSize;
          found = true;
        }
      }
    }

    if (!placedBox) {
      deferred.push({ word, ratio, rotate, color });
      return;
    }

    placedBoxes.push(placedBox);
    boxesByIndex.push(placedBox);
    words.push({
      ...word,
      x: placedX,
      y: placedY,
      startY: Math.min(placedY + 10 + (index % 2) * 2, height - CLOUD_PADDING),
      rotate,
      fontSize: placedFont,
      color,
      letterSpacing: placedFont > 28 ? 0.14 : placedFont > 20 ? 0.08 : 0.04,
      fontWeight: index < 5 ? 500 : 400,
    });
  });

  if (deferred.length > 0) {
    const columns = Math.max(4, Math.floor(width / 82));
    const rows = Math.max(5, Math.ceil(deferred.length / columns) + 2);
    const cellW = (width - CLOUD_PADDING * 2) / columns;
    const cellH = (height - CLOUD_PADDING * 2) / rows;
    deferred.forEach((item, idx) => {
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      const x = CLOUD_PADDING + cellW * col + cellW / 2;
      const y = CLOUD_PADDING + cellH * row + cellH / 2;
      const fontSize = Math.max(minFont, Math.min(minFont + 6, minFont + item.ratio * 6.5));
      const bounded = alignToBounds(x, y, fontSize, item.rotate, item.word.text, 1.4);
      const box = bounded.box;
      const inside =
        box.left >= CLOUD_PADDING &&
        box.right <= width - CLOUD_PADDING &&
        box.top >= CLOUD_PADDING &&
        box.bottom <= height - CLOUD_PADDING;
      if (!inside || intersects(box)) return;

      placedBoxes.push(box);
      boxesByIndex.push(box);
      words.push({
        ...item.word,
        x: bounded.x,
        y: bounded.y,
        startY: Math.min(bounded.y + 8, height - CLOUD_PADDING),
        rotate: item.rotate,
        fontSize: bounded.fontSize,
        color: item.color,
        letterSpacing: 0.04,
        fontWeight: 400,
      });
    });
  }

  if (!words.length) return [];
  const minX = Math.min(...boxesByIndex.map((box) => box.left));
  const maxX = Math.max(...boxesByIndex.map((box) => box.right));
  const minY = Math.min(...boxesByIndex.map((box) => box.top));
  const maxY = Math.max(...boxesByIndex.map((box) => box.bottom));
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const scale = Math.min((width - CLOUD_PADDING * 2) / contentWidth, (height - CLOUD_PADDING * 2) / contentHeight, 1.02);
  const targetCenterX = width / 2;
  const targetCenterY = height / 2;
  const currentCenterX = (minX + maxX) / 2;
  const currentCenterY = (minY + maxY) / 2;

  const finalBoxes: RectBox[] = [];
  const resolvedWords: LayoutWord[] = [];
  const intersectsFinal = (box: RectBox) =>
    finalBoxes.some((b) => !(box.left > b.right || box.right < b.left || box.top > b.bottom || box.bottom < b.top));

  words.forEach((word, index) => {
    const targetX = targetCenterX + (word.x - currentCenterX) * scale;
    const targetY = targetCenterY + (word.y - currentCenterY) * scale;
    let placed = false;

    for (let shrink = 0; shrink <= 8 && !placed; shrink += 1) {
      const nextFont = Math.max(minFont, word.fontSize * Math.min(scale, 1.03) * (1 - shrink * 0.07));
      for (let step = 0; step < 520 && !placed; step += 1) {
        const theta = step * 0.29 + index * 0.61;
        const radius = step * 0.54;
        const x = targetX + Math.cos(theta) * radius;
        const y = targetY + Math.sin(theta) * radius * 0.82;
        const bounded = alignToBounds(x, y, nextFont, word.rotate, word.text, 1.5);
        const box = bounded.box;
        const inside =
          box.left >= CLOUD_PADDING &&
          box.right <= width - CLOUD_PADDING &&
          box.top >= CLOUD_PADDING &&
          box.bottom <= height - CLOUD_PADDING;
        if (!inside || intersectsFinal(box)) continue;

        finalBoxes.push(box);
        resolvedWords.push({
          ...word,
          x: bounded.x,
          y: bounded.y,
          startY: Math.min(bounded.y + 9, height - CLOUD_PADDING),
          fontSize: bounded.fontSize,
          letterSpacing: Math.max(0.02, word.letterSpacing * Math.min(scale, 1.01)),
        });
        placed = true;
      }
    }
  });

  return resolvedWords;
}

export function D5WordCloud({ visible, activeSectorId, selectedNodeId, selfNodeName }: D5WordCloudProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRevealRef = useRef<SVGRectElement>(null);
  const cloudGroupRef = useRef<SVGGElement>(null);
  const wordsRef = useRef<(SVGTextElement | null)[]>([]);
  const hasRevealPlayedRef = useRef(false);
  const previousCloudNodeRef = useRef<string | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [liveWords, setLiveWords] = useState<WordCloudDatum[] | null>(null);

  // Fetch real word cloud data when visible
  useEffect(() => {
    if (!visible) return;
    fetchWordCloud().then((words) => {
      if (words && words.length > 0) setLiveWords(words);
    });
  }, [visible]);

  const resolveCloudNodeId = useCallback((nodeId: string | null | undefined): string => {
    if (!nodeId) return "node-current";
    const resolved = NODE_CLOUD_KEY_ALIASES[nodeId] ?? nodeId;
    return NODE_WORD_CLOUDS[resolved] ? resolved : "node-current";
  }, []);

  const [displayNodeId, setDisplayNodeId] = useState<string>(() =>
    resolveCloudNodeId(selectedNodeId ?? activeSectorId),
  );

  useEffect(() => {
    if (!selectedNodeId) return;
    const nextNodeId = resolveCloudNodeId(selectedNodeId);
    setDisplayNodeId((prev) => (prev === nextNodeId ? prev : nextNodeId));
  }, [selectedNodeId, resolveCloudNodeId]);

  const focusNodeId = displayNodeId;
  const resolvedSelfNodeName = selfNodeName?.trim() || "图书馆-法律文献区";

  const cloudNodeId = focusNodeId;

  const nodeLabel = useMemo(
    () => {
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

      return MACRO_NODES.find((item) => item.id === focusNodeId)?.label ?? NODE_DISPLAY_LABELS[focusNodeId] ?? focusNodeId;
    },
    [focusNodeId, resolvedSelfNodeName],
  );
  const sourceWords = liveWords ?? NODE_WORD_CLOUDS[cloudNodeId] ?? NODE_WORD_CLOUDS["node-current"];
  const layoutWords = useMemo(
    () => buildWordCloudLayout(sourceWords, size.width, size.height),
    [sourceWords, size.width, size.height],
  );

  useEffect(() => {
    wordsRef.current = [];
  }, [layoutWords]);

  useEffect(() => {
    if (!canvasWrapRef.current) return;

    let rafId = 0;

    const updateSize = () => {
      if (!canvasWrapRef.current) return;
      const canvasRect = canvasWrapRef.current.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.floor(canvasRect.width));
      const nextHeight = Math.max(200, Math.floor(canvasRect.height));
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateSize);
    };

    const observer = new ResizeObserver(() => {
      scheduleUpdate();
    });

    scheduleUpdate();
    observer.observe(canvasWrapRef.current);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      hasRevealPlayedRef.current = false;
      previousCloudNodeRef.current = null;
    }
  }, [visible]);

  useGSAP(
    () => {
      if (!visible || !headerRef.current || !canvasRevealRef.current) return;
      const validWords = wordsRef.current.filter((item): item is SVGTextElement => Boolean(item));
      const hasCloudChanged = previousCloudNodeRef.current !== cloudNodeId;
      previousCloudNodeRef.current = cloudNodeId;
      const tl = gsap.timeline();

      const shouldRevealCanvas = !hasRevealPlayedRef.current;
      if (shouldRevealCanvas) {
        tl.to(headerRef.current, {
          autoAlpha: 1,
          duration: 0.35,
          ease: "power2.out",
        });

        tl.to(
          canvasRevealRef.current,
          {
            scaleY: 1,
            duration: 0.55,
            ease: "power2.inOut",
          },
          0.06,
        );
        hasRevealPlayedRef.current = true;
      } else {
        gsap.set(headerRef.current, { autoAlpha: 1 });
        gsap.set(canvasRevealRef.current, { scaleY: 1 });
      }

      tl.to(
        validWords,
        {
          autoAlpha: 1,
          opacity: 1,
          attr: {
            y: (_, target) => Number((target as SVGTextElement).dataset.ty ?? 0),
          },
          duration: hasCloudChanged ? 0.6 : 0.42,
          ease: hasCloudChanged ? "power3.out" : "power2.out",
          stagger: {
            each: 0.018,
            from: "random",
          },
        },
        shouldRevealCanvas ? 0.58 : 0,
      );

      return () => {
        tl.kill();
      };
    },
    { dependencies: [visible, cloudNodeId, layoutWords], scope: rootRef },
  );

  if (!visible) return null;

  return (
    <div ref={rootRef} className="d5cloud-root" aria-label="语义地点词汇云图">
      <header ref={headerRef} className="d1tl-header d5cloud-header">
        <span className="d1tl-header-dot d5cloud-dot" />
        <span className="d1tl-header-title">语义地点词汇云图 · {nodeLabel}</span>
      </header>

      <div ref={canvasWrapRef} className="d5cloud-canvas-wrap">
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="d5cloud-svg"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${nodeLabel} 词云`}
        >
          <rect width={size.width} height={size.height} fill="transparent" />
          <rect
            ref={canvasRevealRef}
            className="d5cloud-canvas-reveal"
            width={size.width}
            height={size.height}
            fill="#f8fafb"
          />

          <g ref={cloudGroupRef}>
            {layoutWords.map((word, index) => (
              <text
                key={`${cloudNodeId}-${word.text}`}
                ref={(el) => {
                  wordsRef.current[index] = el;
                }}
                x={word.x}
                y={word.startY}
                data-ty={word.y}
                className="d5cloud-word"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${word.rotate} ${word.x} ${word.y})`}
                fill={word.color}
                style={{
                  fontSize: `${word.fontSize}px`,
                  letterSpacing: `${word.letterSpacing}px`,
                  fontWeight: word.fontWeight,
                }}
              >
                {word.text}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
