"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { gsap } from "gsap";
import type { DatabaseUpdate } from "@/app/lib/database-types";
import { useAppRuntime } from "@/app/components/runtime/AppRuntimeProvider";
import { buildNodeAuthContext, createNodeAuthHeaders } from "@/app/lib/client/node-auth-headers";

/* ── 轮询间隔 ── */
const POLL_MS = 4000;

interface D1TimelineProps {
  /** 为 true 时开始渲染内部内容（由父组件在画布完全展开后传入） */
  visible: boolean;
}

export function D1Timeline({ visible }: D1TimelineProps) {
  const { username, isSelfCenterNode } = useAppRuntime();
  const [updates, setUpdates] = useState<DatabaseUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animatedRef = useRef(false);
  const firstFetchDoneRef = useRef(false);
  const authHeaders = useMemo(
    () => createNodeAuthHeaders(buildNodeAuthContext({
      account: username,
      isSelfCenterNode,
    })),
    [isSelfCenterNode, username],
  );

  /* ── 拉取更新日志 ── */
  const fetchUpdates = useCallback(async () => {
    try {
      const account = encodeURIComponent((username || "").trim() || "本机节点");
      const res = await fetch(`/api/database/updates?account=${account}`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const errMsg =
          res.status === 401 || res.status === 403
            ? "鉴权失败，无法加载更新日志"
            : `加载失败 (${res.status})`;
        setFetchError(errMsg);
        return;
      }
      const data = await res.json() as { updates: DatabaseUpdate[] };
      setUpdates(data.updates);
      setFetchError(null);
    } catch {
      setFetchError("网络错误，请稍后重试");
    } finally {
      if (!firstFetchDoneRef.current) {
        firstFetchDoneRef.current = true;
        setLoading(false);
      }
    }
  }, [authHeaders, username]);

  /* ── 轮询 ── */
  useEffect(() => {
    fetchUpdates(); // Initial fetch
    if (!visible) return;
    pollTimerRef.current = setInterval(fetchUpdates, POLL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [visible, fetchUpdates]);

  /* ── GSAP 动画 ── */
  useEffect(() => {
    if (!visible || !trackRef.current) return;
    const items = trackRef.current.querySelectorAll(".d1tl-item");
    if (items.length === 0) return;

    if (!animatedRef.current) {
      // 首次入场：错开渐入
      animatedRef.current = true;
      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.out",
        delay: 0.1,
      });
    } else {
      // 轮询后新增条目：立即可见，不重复动画
      gsap.set(items, { opacity: 1, y: 0 });
    }
  }, [visible, updates]);

  if (!visible) return null;

  return (
    <div className="d1tl-root" aria-label="最新更新时间轴">
      {/* ── 标题 ── */}
      <header className="d1tl-header">
        <span className="d1tl-header-dot" />
        <span className="d1tl-header-title">最新更新时间栏</span>
      </header>

      {/* ── 滚动容器 ── */}
      <div ref={scrollRef} className="d1tl-scroll">
        {loading && (
          <div className="d1tl-status">正在加载…</div>
        )}
        {!loading && fetchError && (
          <div className="d1tl-status d1tl-status--error">{fetchError}</div>
        )}
        {!loading && !fetchError && updates.length === 0 && (
          <div className="d1tl-status">暂无更新记录</div>
        )}
        {updates.length > 0 && (
        <div ref={trackRef} className="d1tl-track">
          {updates.map((u, idx) => {
            const isNewest = idx === 0;
            return (
              <div key={u.id} className="d1tl-item">
                {/* 左侧轴：节点 + 虚线/链条 */}
                <div className="d1tl-axis">
                  {isNewest ? (
                    <div className="d1tl-dot-sonar">
                      <div className="sonar-core" />
                      <div className="sonar-wave" />
                      <div className="sonar-wave sonar-wave-delay" />
                    </div>
                  ) : (
                    <div className="d1tl-dot-concentric">
                      <div className="concentric-inner" />
                      <div className="concentric-outer" />
                    </div>
                  )}

                  {idx < updates.length - 1 && (
                    <div className="d1tl-chain" />
                  )}
                </div>

                {/* 右侧内容 */}
                <div className="d1tl-content">
                  <div className="d1tl-meta">
                    <span className="d1tl-time">{u.time}</span>
                    <span className="d1tl-date">{u.date}</span>
                  </div>
                  <p className="d1tl-text">
                    <span className="d1tl-actor">{u.actor}</span>
                    &nbsp;{u.action}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
