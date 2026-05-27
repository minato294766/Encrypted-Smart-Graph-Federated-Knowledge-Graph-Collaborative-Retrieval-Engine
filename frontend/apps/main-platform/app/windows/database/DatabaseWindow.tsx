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
import { FolderOpen, Database, Trash2 } from "lucide-react";
import { GlobalTopNav } from "../shared/GlobalTopNav";
import type { Cluster } from "@/app/lib/database-types";
import { LINE_DRAW_EASE } from "../shared/animation";
import { DB_V_LINE_X_RATIO, DB_LINE_COLOR, DB_LINE_STROKE_W } from "../shared/coords";
import { ClusterDetailWindow } from "./components/ClusterDetailWindow";
import { useAppRuntime } from "@/app/components/runtime/AppRuntimeProvider";
import { buildNodeAuthContext, createNodeAuthHeaders } from "@/app/lib/client/node-auth-headers";

interface DatabaseWindowProps {
  onBack: () => void;
  onNavigateToMain?: () => void;
  onOpenMacro?: () => void;
}

export function DatabaseWindow({ onBack, onNavigateToMain, onOpenMacro }: DatabaseWindowProps) {
  const { username, isSelfCenterNode } = useAppRuntime();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClusterName, setNewClusterName] = useState("");
  const [inputError, setInputError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [deleteTargetCluster, setDeleteTargetCluster] = useState<Cluster | null>(null);
  const [isDeletingCluster, setIsDeletingCluster] = useState(false);

  const createBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // ── Animation refs ─────────────────────────────────────────────────────────
  const rootRef        = useRef<HTMLDivElement>(null);
  const headlineRef    = useRef<HTMLHeadingElement>(null);
  const hLineMarkerRef = useRef<HTMLDivElement>(null);
  const decorRef       = useRef<HTMLDivElement>(null);
  const btnRowRef      = useRef<HTMLDivElement>(null);
  const listPanelRef   = useRef<HTMLDivElement>(null);
  const listHeaderRef  = useRef<HTMLElement>(null);
  const clusterRowsRef = useRef<HTMLDivElement>(null);

  // SVG refs — vertical divider line (fixed, full height)
  const vLineSvgRef = useRef<SVGSVGElement>(null);
  const vLineRef    = useRef<SVGLineElement>(null);

  // SVG refs — horizontal line in left panel (drawn left → vertical divider)
  const hLineSvgRef = useRef<SVGSVGElement>(null);
  const hLineRef    = useRef<SVGLineElement>(null);

  const authHeaders = useMemo(
    () => createNodeAuthHeaders(buildNodeAuthContext({
      account: username,
      isSelfCenterNode,
    })),
    [isSelfCenterNode, username],
  );

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const account = encodeURIComponent((username || "").trim() || "本机节点");
      const clustersRes = await fetch(`/api/database/clusters?account=${account}`, {
        headers: authHeaders,
      });
      if (clustersRes.ok) {
        const data = await clustersRes.json() as { clusters: Cluster[] };
        setClusters(data.clusters);
      }
    } catch {
      // Network error — keep previous state
    }
  }, [authHeaders, username]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Entry animation: SVG lines draw → content fades in ────────────────────
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ── 1. Set initial states (CSS-first FOUC prevention) ──
    gsap.set(root, { autoAlpha: 0 });
    gsap.set(
      [headlineRef.current, decorRef.current, btnRowRef.current, listHeaderRef.current].filter(Boolean),
      { autoAlpha: 0 },
    );
    if (listPanelRef.current) gsap.set(listPanelRef.current, { autoAlpha: 0 });

    // ── 2. Prepare vertical line (full viewport height, top → bottom) ──
    const vLine = vLineRef.current;
    const vLineSvg = vLineSvgRef.current;
    if (vLine && vLineSvg) {
      const vLen = vLine.getTotalLength();
      gsap.set(vLine, { strokeDasharray: vLen, strokeDashoffset: vLen });
    }

    // ── 3. Prepare horizontal line (left side → stop at vertical divider) ──
    const hLine = hLineRef.current;
    const hLineSvg = hLineSvgRef.current;
    if (hLine && hLineSvg && hLineMarkerRef.current) {
      // Sync vertical position with marker
      const markerRect = hLineMarkerRef.current.getBoundingClientRect();
      gsap.set(hLineSvg, { top: markerRect.top });

      const hLen = hLine.getTotalLength();
      gsap.set(hLine, { strokeDasharray: hLen, strokeDashoffset: hLen });
    }

    // ── 4. Master timeline ──
    const tl = gsap.timeline();

    // Phase 0 — page fade in
    tl.to(root, { autoAlpha: 1, duration: 0.22, ease: "power2.out" }, 0);

    // Phase 1 — draw vertical line (top to bottom, 0.5s, slowFastSlow)
    if (vLine) {
      tl.to(vLine, {
        strokeDashoffset: 0,
        duration: 0.5,
        ease: LINE_DRAW_EASE,
      }, 0.22);
    }

    // Phase 2 — draw horizontal line (left → divider, starts slightly after vertical)
    if (hLine) {
      tl.to(hLine, {
        strokeDashoffset: 0,
        duration: 0.45,
        ease: LINE_DRAW_EASE,
      }, 0.32);
    }

    // Phase 3 — headline slides up
    tl.to(headlineRef.current, {
      autoAlpha: 1,
      y: 0,
      duration: 0.32,
      ease: "power3.out",
    }, 0.55);

    // Phase 4 — decorative text
    tl.to(decorRef.current, {
      autoAlpha: 1,
      duration: 0.24,
      ease: "power2.out",
    }, 0.72);

    // Phase 5 — create button
    tl.to(btnRowRef.current, {
      autoAlpha: 1,
      duration: 0.22,
      ease: "power2.out",
    }, 0.88);

    // Phase 6 — right panel fades in with slight x slide
    tl.to(listPanelRef.current, {
      autoAlpha: 1,
      x: 0,
      duration: 0.3,
      ease: "power2.out",
    }, 0.65);

    // Phase 7 — list header
    tl.to(listHeaderRef.current, {
      autoAlpha: 1,
      duration: 0.24,
      ease: "power2.out",
    }, 0.75);

    // Phase 8 — cluster rows stagger
    const rows = clusterRowsRef.current?.querySelectorAll(".db-cluster-row");
    if (rows && rows.length > 0) {
      tl.fromTo(rows,
        { autoAlpha: 0, x: 18 },
        { autoAlpha: 1, x: 0, duration: 0.35, ease: "power2.out", stagger: 0.06 },
        0.85,
      );
    }

    return () => { tl.kill(); };
  }, []);

  // ── Re-animate new cluster rows when clusters data arrives ─────────────────
  useEffect(() => {
    const rows = clusterRowsRef.current?.querySelectorAll(".db-cluster-row");
    if (!rows || rows.length === 0) return;
    gsap.fromTo(rows,
      { autoAlpha: 0, x: 14 },
      { autoAlpha: 1, x: 0, duration: 0.32, ease: "power2.out", stagger: 0.05 },
    );
  }, [clusters]);

  // ── Modal focus management ─────────────────────────────────────────────────
  useEffect(() => {
    if (isModalOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isModalOpen]);

  // ── Esc to close modal ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) closeModal();
      if (e.key === "Escape" && deleteTargetCluster && !isDeletingCluster) setDeleteTargetCluster(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, deleteTargetCluster, isDeletingCluster]);

  // ── Modal handlers ─────────────────────────────────────────────────────────
  const openModal = useCallback(() => {
    setNewClusterName("");
    setInputError("");
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setInputError("");
    setTimeout(() => createBtnRef.current?.focus(), 50);
  }, []);

  const handleSubmit = useCallback(async () => {
    const name = newClusterName.trim();
    if (!name) { setInputError("聚类名称不能为空"); return; }
    if (name.length > 50) { setInputError("名称不能超过 50 个字符"); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/database/clusters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ name, actor: username, account: username }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setInputError(data.error ?? "创建失败，请重试");
        return;
      }
      await fetchData();
      closeModal();
    } catch {
      setInputError("网络错误，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }, [authHeaders, newClusterName, fetchData, closeModal, username]);

  const handleConfirmDeleteCluster = useCallback(async () => {
    if (!deleteTargetCluster) return;
    setIsDeletingCluster(true);
    try {
      const res = await fetch(`/api/database/clusters/${deleteTargetCluster.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ actor: username, account: username }),
      });
      if (!res.ok) return;
      setDeleteTargetCluster(null);
      if (selectedCluster?.id === deleteTargetCluster.id) {
        setSelectedCluster(null);
      }
      await fetchData();
    } finally {
      setIsDeletingCluster(false);
    }
  }, [authHeaders, deleteTargetCluster, fetchData, selectedCluster?.id, username]);

  const totalFileCount = clusters.reduce((sum, cluster) => sum + cluster.fileCount, 0);

  return (
    <div ref={rootRef} className="db-window">
      <GlobalTopNav
        currentWindow="database"
        onNavigateToMain={onNavigateToMain}
        onNavigateToDatabase={undefined}
        onNavigateToMacro={onOpenMacro}
        onLogout={onBack}
      />

      <div className="db-window-content-shell">

      {/* ── Main vertical divider line (full screen height, GSAP drawn) ── */}
      <svg
        ref={vLineSvgRef}
        className="db-v-line-svg"
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "var(--global-top-nav-height)",
          left: `${DB_V_LINE_X_RATIO * 100}vw`,
          width: "2px",
          height: "calc(100dvh - var(--global-top-nav-height))",
          pointerEvents: "none",
          zIndex: 15,
          overflow: "visible",
        }}
        viewBox="0 0 2 900"
        preserveAspectRatio="none"
      >
        <line
          ref={vLineRef}
          id="db-v-main-line"
          x1="1" y1="0" x2="1" y2="900"
          stroke={DB_LINE_COLOR}
          strokeWidth={DB_LINE_STROKE_W}
          strokeLinecap="square"
        />
      </svg>

      {/* ── Main horizontal line (STRICTLY from screen left to vertical divider) ── */}
      <svg
        ref={hLineSvgRef}
        className="db-h-line-svg"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          // Position vertically based on the marker in the left panel
          top: "50%", 
          width: `${DB_V_LINE_X_RATIO * 100}vw`,
          height: "2px",
          pointerEvents: "none",
          zIndex: 15,
          overflow: "visible",
        }}
        preserveAspectRatio="none"
      >
        <line
          ref={hLineRef}
          id="db-h-main-line"
          x1="0" y1="1" x2="100%" y2="1"
          stroke={DB_LINE_COLOR}
          strokeWidth="1"
          strokeLinecap="square"
        />
      </svg>

      {/* ── Single-screen page body ────────────────────────────────────── */}
      <div className="db-page">

        {/* ── LEFT panel: title + decor + button ─────────────── */}
        <div className="db-left">

          <h1
            ref={headlineRef}
            className="db-headline"
            style={{ visibility: "hidden", opacity: 0, transform: "translateY(24px)" }}
          >
            您已经贡献了<br />
            {clusters.length}篇数据库聚类<br />
            {totalFileCount}篇文献<br />
            感谢您的共享
          </h1>

          {/* Marker for the horizontal line's vertical position */}
          <div ref={hLineMarkerRef} className="db-h-line-marker" style={{ height: "2px", margin: "1.5rem 0" }} />

          <div
            ref={decorRef}
            className="db-decor-group"
            aria-hidden="true"
            style={{ visibility: "hidden", opacity: 0 }}
          >
            <p className="db-decor-label">您可在此新增数据库聚类</p>
            <p className="db-decor-label">进入聚类可上传新文件</p>
          </div>

          <div
            ref={btnRowRef}
            className="db-btn-row"
            style={{ visibility: "hidden", opacity: 0 }}
          >
            <button
              ref={createBtnRef}
              className="db-create-btn"
              onClick={openModal}
              aria-haspopup="dialog"
              aria-expanded={isModalOpen}
            >
              新建聚类
            </button>
          </div>

        </div>

        {/* ── RIGHT panel: cluster list (transplanted from screen 2) ─── */}
        <div
          ref={listPanelRef}
          className="db-right"
          style={{ visibility: "hidden", opacity: 0, transform: "translateX(20px)" }}
        >
          <header ref={listHeaderRef} className="db-list-header" style={{ visibility: "hidden", opacity: 0 }}>
            <p className="db-list-eyebrow">CLUSTER INDEX</p>
            <div className="db-list-title-row">
              <h2 className="db-list-title">聚类列表</h2>
              <span className="db-list-count">{clusters.length} 个聚类</span>
            </div>
          </header>

          <div ref={clusterRowsRef} className="db-list-body" role="list">
            {clusters.length === 0 ? (
              <div className="db-list-empty" role="listitem">
                <Database size={24} strokeWidth={1} aria-hidden="true" />
                <span>暂无聚类 — 点击「新建聚类」开始创建</span>
              </div>
            ) : (
              clusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className="db-cluster-row"
                  role="listitem"
                  tabIndex={0}
                  onClick={() => setSelectedCluster(cluster)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedCluster(cluster)}
                  aria-label={`进入聚类：${cluster.name}`}
                >
                  {/* Left: icon + name */}
                  <div className="db-cluster-main">
                    <div className="db-cluster-icon" aria-hidden="true">
                      <FolderOpen size={16} strokeWidth={1.5} />
                    </div>
                    <span className="db-cluster-name">{cluster.name}</span>
                  </div>

                  {/* Sub-divider line (vertical, from second screen style) */}
                  <div className="db-cluster-sub-divider" aria-hidden="true" />

                  {/* Right: file count + date stacked */}
                  <div className="db-cluster-side">
                    <span className="db-cluster-meta">文件数: {cluster.fileCount}</span>
                    <span className="db-cluster-date">{cluster.createdAt}</span>
                    <button
                      className="db-cluster-delete-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTargetCluster(cluster);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label={`删除聚类：${cluster.name}`}
                    >
                      <Trash2 size={12} strokeWidth={1.9} />
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      </div>

      {/* ── Cluster Detail Overlay ────────────────────────────────────── */}
      {selectedCluster && (
        <ClusterDetailWindow
          cluster={selectedCluster}
          accountName={username}
          isSelfCenterNode={isSelfCenterNode}
          onBack={() => {
            setSelectedCluster(null);
            void fetchData();
          }}
          onFilesChanged={fetchData}
        />
      )}

      {/* ── Create Cluster Modal ──────────────────────────────────────── */}
      {isModalOpen && (
        <div
          className="db-modal-overlay"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="db-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="db-modal-title"
          >
            <div className="db-modal-header">
              <p className="db-modal-eyebrow">DATABASE · NEW ENTRY</p>
              <h3 id="db-modal-title" className="db-modal-title">新建聚类</h3>
            </div>

            <div className="db-modal-body">
              <label className="db-modal-label" htmlFor="db-cluster-input">
                聚类名称
              </label>
              <input
                id="db-cluster-input"
                ref={inputRef}
                className="db-modal-input"
                type="text"
                value={newClusterName}
                onChange={(e) => { setNewClusterName(e.target.value); setInputError(""); }}
                onKeyDown={(e) => e.key === "Enter" && !isSubmitting && handleSubmit()}
                placeholder="输入聚类名称…"
                maxLength={50}
                aria-describedby={inputError ? "db-modal-error" : undefined}
                aria-invalid={!!inputError}
                autoComplete="off"
              />
              {inputError && (
                <p id="db-modal-error" className="db-modal-error" role="alert">
                  {inputError}
                </p>
              )}
            </div>

            <div className="db-modal-footer">
              <button
                className="db-modal-cancel"
                onClick={closeModal}
                type="button"
              >
                取消
              </button>
              <button
                className="db-modal-confirm"
                onClick={handleSubmit}
                type="button"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "创建中…" : "确认创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTargetCluster && (
        <div
          className="db-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingCluster) {
              setDeleteTargetCluster(null);
            }
          }}
        >
          <div
            className="db-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="db-delete-cluster-title"
          >
            <div className="db-modal-header">
              <p className="db-modal-eyebrow">DATABASE · DELETE</p>
              <h3 id="db-delete-cluster-title" className="db-modal-title db-modal-title--danger">
                删除聚类
              </h3>
            </div>

            <div className="db-modal-body">
              <p className="db-modal-desc">
                确认删除聚类《{deleteTargetCluster.name}》？该聚类下文件将一并删除，且不可恢复。
              </p>
            </div>

            <div className="db-modal-footer">
              <button
                className="db-modal-cancel"
                onClick={() => setDeleteTargetCluster(null)}
                type="button"
                disabled={isDeletingCluster}
              >
                取消
              </button>
              <button
                className="db-modal-confirm db-modal-confirm--danger"
                onClick={handleConfirmDeleteCluster}
                type="button"
                disabled={isDeletingCluster}
                aria-busy={isDeletingCluster}
              >
                {isDeletingCluster ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
