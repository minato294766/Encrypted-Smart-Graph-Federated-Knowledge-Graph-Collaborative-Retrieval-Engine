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
import { FileSearch } from "lucide-react";
import { LINE_DRAW_EASE } from "../../shared/animation";
import { FilePreviewModal } from "../../database/components/FilePreviewModal";
import { TraceKnowledgeGraph } from "./TraceKnowledgeGraph";

// ── Dynamic evidence type ────────────────────────────────────────────────────
export interface TraceEvidence {
  source: string;
  content: string;
  relevance: number;
}

// ─── SVG canvas dimensions ───────────────────────────────────────────────────
const TVW = 1440;
const TVH = 900;

const C1 = TVW * 0.25;
const C3 = C1 + ((TVW - C1) * 2) / 3;
const EDGE_Y_GAP = 88;
const RTOP = EDGE_Y_GAP;
const RBOTTOM = TVH - EDGE_Y_GAP;
const DOUBLE_LINE_GAP = 3;
const ROW_HEIGHT = (RBOTTOM - RTOP) / 5;
const CELL_X_PADDING = 14;
const CELL_Y_PADDING = 10;
const INTRO_X = 30;
const INTRO_Y = TVH * 0.29;
const INTRO_WIDTH = C1 - 60;
const INTRO_HEIGHT = TVH - 130;
const TRACE_COL_HEAD_Y = RTOP - 28;
const TRACE_COL_HEAD_LEFT_X = C1 + 16;
const TRACE_COL_META_DIVIDER_X = TRACE_COL_HEAD_LEFT_X + 200;
const TRACE_COL_META_X = TRACE_COL_META_DIVIDER_X + 20;
const TRACE_COL_META_Y = TRACE_COL_HEAD_Y - 2;
const TRACE_COL_META_DIVIDER_Y_TOP = TRACE_COL_META_Y - 14;
const TRACE_COL_META_DIVIDER_Y_BOTTOM = TRACE_COL_META_Y + 8;

interface TraceRow {
  id: string;
  sourceTitle: string;
  refIndex: number;
  text: string;
  fullText: string;
  clusterName: string;
  fileName: string;
}

interface TraceDataset {
  rows: TraceRow[];
}

interface TraceLineDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  start: number;
  duration: number;
  strokeWidth: number;
}

interface TracePreviewTarget {
  file: File;
  name: string;
  highlightPhrases: string[];
}

const TRACE_LINES: TraceLineDef[] = [
  { id: "c1", x1: C1, y1: 0, x2: C1, y2: TVH, start: 0, duration: 0.5, strokeWidth: 4 },
  { id: "c3", x1: C3, y1: 0, x2: C3, y2: TVH, start: 0, duration: 0.5, strokeWidth: 2.2 },
  { id: "rtop-1", x1: C1, y1: RTOP - DOUBLE_LINE_GAP / 2, x2: TVW, y2: RTOP - DOUBLE_LINE_GAP / 2, start: 0.4, duration: 0.4, strokeWidth: 2.8 },
  { id: "rtop-2", x1: C1, y1: RTOP + DOUBLE_LINE_GAP / 2, x2: TVW, y2: RTOP + DOUBLE_LINE_GAP / 2, start: 0.4, duration: 0.4, strokeWidth: 2 },
  { id: "rbottom-1", x1: C1, y1: RBOTTOM - DOUBLE_LINE_GAP / 2, x2: TVW, y2: RBOTTOM - DOUBLE_LINE_GAP / 2, start: 0.4, duration: 0.4, strokeWidth: 2.8 },
  { id: "rbottom-2", x1: C1, y1: RBOTTOM + DOUBLE_LINE_GAP / 2, x2: TVW, y2: RBOTTOM + DOUBLE_LINE_GAP / 2, start: 0.4, duration: 0.4, strokeWidth: 2 },
  { id: "r1", x1: C1, y1: RTOP + ROW_HEIGHT * 1, x2: TVW, y2: RTOP + ROW_HEIGHT * 1, start: 0.5, duration: 0.3, strokeWidth: 1.3 },
  { id: "r2", x1: C1, y1: RTOP + ROW_HEIGHT * 2, x2: TVW, y2: RTOP + ROW_HEIGHT * 2, start: 0.6, duration: 0.3, strokeWidth: 1.3 },
  { id: "r3", x1: C1, y1: RTOP + ROW_HEIGHT * 3, x2: TVW, y2: RTOP + ROW_HEIGHT * 3, start: 0.7, duration: 0.3, strokeWidth: 1.3 },
  { id: "r4", x1: C1, y1: RTOP + ROW_HEIGHT * 4, x2: TVW, y2: RTOP + ROW_HEIGHT * 4, start: 0.8, duration: 0.3, strokeWidth: 1.3 },
  { id: "bottom-boundary", x1: 0, y1: TVH - 1, x2: TVW, y2: TVH - 1, start: 0.9, duration: 0.3, strokeWidth: 2.2 },
];

function ensureTrailingEllipsis(text: string): string {
  const trimmed = text.trimEnd().replace(/[。！？；，、,.!?;:：]+$/g, "");
  if (/……$/.test(trimmed)) return trimmed;
  return `${trimmed}……`;
}

function buildDatasetFromEvidence(evidence: TraceEvidence[]): TraceDataset {
  return {
    rows: evidence.map((e, i) => ({
      id: `ev-${i}`,
      sourceTitle: e.source,
      refIndex: i + 1,
      text: e.content.replace(/[。！？；，、,.!?;:：]+$/g, ""),
      fullText: e.content,
      clusterName: "知识图谱",
      fileName: e.source,
    })),
  };
}

function buildTracePreviewFile(row: TraceRow): File {
  const content = [
    `来源文件：${row.fileName}`,
    `所属聚类：${row.clusterName}`,
    `对应文献：${row.sourceTitle}`,
    `Reference：${row.refIndex}`,
    "",
    row.fullText,
  ].join("\n");

  return new File([content], row.fileName, {
    type: "text/plain;charset=utf-8",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface TraceWindowProps {
  msgId: string;
  evidence: TraceEvidence[];
  onClose: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TraceWindow({ msgId, evidence, onClose }: TraceWindowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const graphPageRef = useRef<HTMLElement>(null);
  const scrollTweenRef = useRef<gsap.core.Tween | null>(null);
  const hoverDashTweenRef = useRef<gsap.core.Tween | null>(null);
  const hoveredRowRef = useRef<number | null>(null);
  const previousAnimatedRowRef = useRef<number | null>(null);
  const e1FocusRectsRef = useRef<Array<SVGRectElement | null>>([]);
  const e1GlowRectsRef = useRef<Array<SVGRectElement | null>>([]);
  const e2FillRectsRef = useRef<Array<SVGRectElement | null>>([]);
  const e2BorderRectsRef = useRef<Array<SVGRectElement | null>>([]);
  const fileBoxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [graphActivated, setGraphActivated] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<TracePreviewTarget | null>(null);
  const isClosingRef = useRef(false);
  const dataset = useMemo(() => buildDatasetFromEvidence(evidence), [evidence]);

  const updateHoveredRow = useCallback((nextRow: number | null) => {
    if (hoveredRowRef.current === nextRow) return;
    hoveredRowRef.current = nextRow;
    setHoveredRow(nextRow);
  }, []);

  const applyRowVisualState = useCallback((activeRow: number | null) => {
    hoverDashTweenRef.current?.kill();
    hoverDashTweenRef.current = null;

    const animateRowState = (idx: number, isActive: boolean) => {
      const e1Focus = e1FocusRectsRef.current[idx];
      const e1Glow = e1GlowRectsRef.current[idx];
      const e2Fill = e2FillRectsRef.current[idx];
      const e2Border = e2BorderRectsRef.current[idx];
      const fileBox = fileBoxRefs.current[idx];

      const overlays = [e1Focus, e1Glow, e2Fill, e2Border].filter(
        (el): el is SVGRectElement => el !== null,
      );

      if (e1Focus) {
        gsap.set(e1Focus, { strokeDasharray: "15 10", strokeDashoffset: 0 });
      }

      gsap.killTweensOf(overlays);
      if (fileBox) gsap.killTweensOf(fileBox);

      if (overlays.length > 0) {
        gsap.to(overlays, {
          opacity: isActive ? 1 : 0,
          duration: 0.16,
          ease: "power2.out",
          overwrite: "auto",
        });
      }

      if (fileBox) {
        gsap.to(fileBox, {
          color: isActive ? "#ffffff" : "#000000",
          duration: 0.16,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
    };

    const previousActiveRow = previousAnimatedRowRef.current;
    if (previousActiveRow !== null && previousActiveRow !== activeRow) {
      animateRowState(previousActiveRow, false);
    }

    if (activeRow !== null) {
      animateRowState(activeRow, true);
    }

    previousAnimatedRowRef.current = activeRow;

    if (activeRow !== null) {
      const activeFocus = e1FocusRectsRef.current[activeRow];
      if (activeFocus) {
        hoverDashTweenRef.current = gsap.to(activeFocus, {
          strokeDashoffset: -50,
          duration: 1.05,
          ease: "none",
          repeat: -1,
        });
      }
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    gsap.set(root, { yPercent: 100 });
    const t = gsap.to(root, { yPercent: 0, duration: 0.72, ease: "power3.out" });
    return () => {
      t.kill();
    };
  }, []);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    TRACE_LINES.forEach(({ id }) => {
      const el = svg.querySelector<SVGLineElement>(`#${id}`);
      if (!el) return;
      const len = el.getTotalLength();
      gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
    });

    gsap.set(
      svg.querySelectorAll<SVGRectElement>(
        ".trace-e1-hover-stroke, .trace-e1-hover-glow, .trace-e2-hover-fill, .trace-e2-hover-border",
      ),
      { opacity: 0 },
    );
    gsap.set(svg.querySelectorAll<HTMLDivElement>(".trace-row-box--file"), { color: "#000000" });

    gsap.set(svg.querySelectorAll<SVGGElement>(".trace-row-content"), { opacity: 0 });

    const tl = gsap.timeline({ paused: true });
    TRACE_LINES.forEach(({ id, start, duration }) => {
      const line = svg.querySelector<SVGLineElement>(`#${id}`);
      if (!line) return;
      tl.to(line, { strokeDashoffset: 0, duration, ease: LINE_DRAW_EASE }, start);
    });

    tl.to(
      svg.querySelectorAll<SVGGElement>(".trace-row-content"),
      { opacity: 1, duration: 0.24, stagger: 0.06, ease: "power1.out" },
      0.94,
    );

    tl.play(0);

    return () => {
      tl.kill();
    };
  }, []);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    scrollTweenRef.current?.kill();

    const root = rootRef.current;
    if (!root) {
      onClose();
      return;
    }

    gsap.to(root, {
      yPercent: 100, duration: 0.5, ease: "power3.in", onComplete: onClose,
    });
  }, [onClose]);

  const handleOpenKnowledgeGraph = useCallback(() => {
    const scroller = scrollerRef.current;
    const graphPage = graphPageRef.current;
    if (!scroller || !graphPage) return;

    setGraphActivated(true);

    scrollTweenRef.current?.kill();
    scrollTweenRef.current = gsap.to(scroller, {
      scrollTop: graphPage.offsetTop,
      duration: 0.62,
      ease: "power2.out",
    });
  }, []);

  useEffect(() => {
    if (graphActivated) return;
    const scroller = scrollerRef.current;
    const graphPage = graphPageRef.current;
    if (!scroller || !graphPage) return;

    const handleScrollerPosition = () => {
      if (scroller.scrollTop + scroller.clientHeight >= graphPage.offsetTop + 80) {
        setGraphActivated(true);
      }
    };

    handleScrollerPosition();
    scroller.addEventListener("scroll", handleScrollerPosition, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", handleScrollerPosition);
    };
  }, [graphActivated]);

  const handleOpenPreview = useCallback((row: TraceRow) => {
    setPreviewTarget({
      file: buildTracePreviewFile(row),
      name: row.fileName,
      highlightPhrases: [row.text],
    });
  }, []);

  const handleOpenPreviewFromSelectedRow = useCallback((row: TraceRow, rowIndex: number) => {
    if (hoveredRowRef.current !== rowIndex) return;
    handleOpenPreview(row);
  }, [handleOpenPreview]);

  const handleClosePreview = useCallback(() => {
    setPreviewTarget(null);
  }, []);

  const handleSvgPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const localX = ((event.clientX - rect.left) / rect.width) * TVW;
    const localY = ((event.clientY - rect.top) / rect.height) * TVH;

    const inRows = localX >= C1 && localX <= TVW && localY >= RTOP && localY <= RBOTTOM;
    if (!inRows) {
      updateHoveredRow(null);
      return;
    }

    const idx = Math.max(0, Math.min(4, Math.floor((localY - RTOP) / ROW_HEIGHT)));
    updateHoveredRow(idx);
  }, [updateHoveredRow]);

  useEffect(() => {
    return () => {
      scrollTweenRef.current?.kill();
      hoverDashTweenRef.current?.kill();
    };
  }, []);

  useEffect(() => {
    applyRowVisualState(hoveredRow);
  }, [applyRowVisualState, hoveredRow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (previewTarget) {
          setPreviewTarget(null);
          return;
        }
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleClose, previewTarget]);

  return (
    <div ref={rootRef} className="trace-window-root" aria-label="知识溯源窗口" data-msg-id={msgId}>
      <div className="trace-window-bg" aria-hidden="true" />

      <div ref={scrollerRef} className="trace-scroller">
        <div className="trace-canvas">

          <section className="trace-page trace-page--main">
            <button
              type="button"
              className="trace-page-main-close-btn mc-close-btn"
              onClick={handleClose}
              aria-label="关闭知识溯源"
            >
              <span className="mc-close-x" aria-hidden="true" />
            </button>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${TVW} ${TVH}`}
              preserveAspectRatio="none"
              className="trace-frame-svg"
              aria-label="知识溯源"
              onPointerMove={handleSvgPointerMove}
              onPointerLeave={() => updateHoveredRow(null)}
            >
              <foreignObject
                className="trace-intro-fo"
                x={INTRO_X}
                y={INTRO_Y}
                width={INTRO_WIDTH}
                height={INTRO_HEIGHT}
              >
                <div className="trace-intro-box">
                  <h1 className="trace-intro-box-title">知识溯源</h1>
                  <div className="trace-intro-graph-btn-wrap">
                    <button
                      type="button"
                      className="animated-button trace-graph-btn"
                      onClick={handleOpenKnowledgeGraph}
                    >
                      <svg viewBox="0 0 24 24" className="arr-2" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
                      </svg>
                      <span className="text">打开知识图谱</span>
                      <span className="circle" />
                      <svg viewBox="0 0 24 24" className="arr-1" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </foreignObject>

              <text
                className="trace-col-head"
                x={TRACE_COL_HEAD_LEFT_X}
                y={TRACE_COL_HEAD_Y}
                textAnchor="start"
              >
                语义相关文本
              </text>
              <line
                className="trace-col-head-divider trace-col-head-divider--glow"
                x1={TRACE_COL_META_DIVIDER_X}
                y1={TRACE_COL_META_DIVIDER_Y_TOP}
                x2={TRACE_COL_META_DIVIDER_X}
                y2={TRACE_COL_META_DIVIDER_Y_BOTTOM}
              />
              <line
                className="trace-col-head-divider trace-col-head-divider--core"
                x1={TRACE_COL_META_DIVIDER_X}
                y1={TRACE_COL_META_DIVIDER_Y_TOP}
                x2={TRACE_COL_META_DIVIDER_X}
                y2={TRACE_COL_META_DIVIDER_Y_BOTTOM}
              />
              <text
                className="trace-col-meta"
                x={TRACE_COL_META_X}
                y={TRACE_COL_META_Y}
                textAnchor="start"
              >
                {`${dataset.rows.length}份高相关文本`}
              </text>
              <text
                className="trace-col-head"
                x={C3 + 16}
                y={TRACE_COL_HEAD_Y}
                textAnchor="start"
              >
                来源文件
              </text>

              {TRACE_LINES.map(({ id, x1, y1, x2, y2, strokeWidth }) => (
                <line
                  key={id}
                  id={id}
                  className="trace-line"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={strokeWidth}
                />
              ))}

              {dataset.rows.map((row, idx) => {
                const rowY = RTOP + ROW_HEIGHT * idx;
                return (
                  <g
                    className="trace-row-content"
                    key={`trace-row-${idx}`}
                    onPointerEnter={() => updateHoveredRow(idx)}
                    onClick={() => handleOpenPreviewFromSelectedRow(row, idx)}
                  >
                    <rect
                      className="trace-row-hit"
                      x={C1}
                      y={rowY}
                      width={TVW - C1}
                      height={ROW_HEIGHT}
                    />

                    <rect
                      ref={(el) => {
                        e2FillRectsRef.current[idx] = el;
                      }}
                      className="trace-e2-hover-fill"
                      x={C3 + 1}
                      y={rowY + 1}
                      width={TVW - C3 - 2}
                      height={ROW_HEIGHT - 2}
                    />

                    <rect
                      ref={(el) => {
                        e2BorderRectsRef.current[idx] = el;
                      }}
                      className="trace-e2-hover-border"
                      x={C3 + 1}
                      y={rowY + 1}
                      width={TVW - C3 - 2}
                      height={ROW_HEIGHT - 2}
                    />

                    <rect
                      ref={(el) => {
                        e1GlowRectsRef.current[idx] = el;
                      }}
                      className="trace-e1-hover-glow"
                      x={C1 + 1}
                      y={rowY + 1}
                      width={C3 - C1 - 2}
                      height={ROW_HEIGHT - 2}
                    />

                    <rect
                      ref={(el) => {
                        e1FocusRectsRef.current[idx] = el;
                      }}
                      className="trace-e1-hover-stroke"
                      x={C1 + 1}
                      y={rowY + 1}
                      width={C3 - C1 - 2}
                      height={ROW_HEIGHT - 2}
                    />

                    <foreignObject
                      className="trace-row-fo"
                      x={C1 + CELL_X_PADDING}
                      y={rowY + CELL_Y_PADDING}
                      width={C3 - C1 - CELL_X_PADDING * 2}
                      height={ROW_HEIGHT - CELL_Y_PADDING * 2}
                    >
                      <div className="trace-row-box trace-row-box--text">
                        <span className="trace-row-box-content trace-row-box-content--text">
                          {ensureTrailingEllipsis(row.text)}
                        </span>
                      </div>
                    </foreignObject>
                    <foreignObject
                      className="trace-row-fo"
                      x={C3 + CELL_X_PADDING}
                      y={rowY + CELL_Y_PADDING}
                      width={TVW - C3 - CELL_X_PADDING * 2}
                      height={ROW_HEIGHT - CELL_Y_PADDING * 2}
                    >
                      <div
                        ref={(el) => {
                          fileBoxRefs.current[idx] = el;
                        }}
                        className="trace-row-box trace-row-box--file"
                      >
                        <div className="trace-row-file-main">
                          <span className="trace-row-file-cluster">{row.clusterName}</span>
                          <span className="trace-row-file-name">{row.fileName}</span>
                        </div>
                        <button
                          type="button"
                          className="trace-row-preview-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenPreviewFromSelectedRow(row, idx);
                          }}
                          aria-label={`打开来源文件预览：${row.fileName}`}
                        >
                          <FileSearch size={18} strokeWidth={1.9} className="trace-row-preview-icon" />
                          <span className="trace-row-preview-label">预览文件</span>
                        </button>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
          </section>

          <section ref={graphPageRef} className="trace-page trace-page--graph" aria-label="知识图谱页面">
            {graphActivated ? (
              <TraceKnowledgeGraph onExit={handleClose} />
            ) : (
              <div className="trace-graph-shell trace-graph-shell--placeholder" aria-hidden="true">
                <div className="trace-graph-mask">知识图谱将在进入该页面时加载…</div>
              </div>
            )}
          </section>

        </div>
      </div>

      {previewTarget && (
        <FilePreviewModal
          file={previewTarget.file}
          name={previewTarget.name}
          highlightPhrases={previewTarget.highlightPhrases}
          onClose={handleClosePreview}
        />
      )}
    </div>
  );
}
