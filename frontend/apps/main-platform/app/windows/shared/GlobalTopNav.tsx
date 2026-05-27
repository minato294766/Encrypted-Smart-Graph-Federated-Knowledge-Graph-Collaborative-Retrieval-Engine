"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppRuntime } from "@/app/components/runtime/AppRuntimeProvider";
import { adminListRequests } from "@/app/lib/client/admin-adapter";
import { ProfileModalLong } from "./ProfileModalLong";
import { AdminModal } from "./AdminModal";

type WindowKey = "macro" | "database" | "main";

interface GlobalTopNavProps {
  currentWindow: WindowKey;
  onNavigateToMacro?: () => void;
  onNavigateToDatabase?: () => void;
  onNavigateToMain?: () => void;
  onLogout?: () => void;
}

const NAV_ITEMS: Array<{ key: WindowKey; label: string }> = [
  { key: "macro", label: "宏观平台" },
  { key: "database", label: "数据库" },
  { key: "main", label: "交互对话" },
];

export function GlobalTopNav({
  currentWindow,
  onNavigateToMacro,
  onNavigateToDatabase,
  onNavigateToMain,
  onLogout,
}: GlobalTopNavProps) {
  const { avatarDataUrl, isAdmin } = useAppRuntime();
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [switchingNavKey, setSwitchingNavKey] = useState<WindowKey | null>(null);
  const switchingTimerRef = useRef<number | null>(null);

  const handleWindowNavigate = useCallback(
    (target: WindowKey) => {
      if (target === currentWindow) return;
      if (target === "macro") onNavigateToMacro?.();
      if (target === "database") onNavigateToDatabase?.();
      if (target === "main") onNavigateToMain?.();
    },
    [currentWindow, onNavigateToDatabase, onNavigateToMacro, onNavigateToMain],
  );

  const closeAllPopups = useCallback(() => {
    setProfileOpen(false);
    setAdminOpen(false);
    setLogoutOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (switchingTimerRef.current !== null) {
        window.clearTimeout(switchingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setPendingCount(0);
      return;
    }

    let cancelled = false;
    const refreshPendingCount = async () => {
      try {
        const requests = await adminListRequests();
        if (!cancelled) {
          setPendingCount(requests.length);
        }
      } catch {
        // 读取失败时保持现有提示状态，避免误清零
      }
    };

    void refreshPendingCount();
    const timerId = window.setInterval(() => {
      void refreshPendingCount();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [isAdmin]);

  return (
    <>
      <header className="global-top-nav" role="banner" aria-label="全局顶部导航栏">
        <div className="global-top-nav__left">
          <img src="/logo.svg" className="global-top-nav__logo" alt="项目Logo" width="44" height="44" />
          <span className="global-top-nav__thick-separator" aria-hidden="true" />
          <span className="global-top-nav__brand">密态智图</span>
        </div>

        <nav className="global-top-nav__center" aria-label="窗口切换">
          {NAV_ITEMS.map((item, index) => (
            <div key={item.key} className="global-top-nav__nav-item-wrap">
              <button
                type="button"
                className={`global-top-nav__nav-item global-top-nav__nav-item--${item.key}${currentWindow === item.key ? " is-active" : ""}${switchingNavKey === item.key ? " is-switching" : ""}`}
                onClick={() => {
                  setSwitchingNavKey(item.key);
                  if (switchingTimerRef.current !== null) {
                    window.clearTimeout(switchingTimerRef.current);
                  }
                  switchingTimerRef.current = window.setTimeout(() => {
                    setSwitchingNavKey((prev) => (prev === item.key ? null : prev));
                  }, 240);
                  handleWindowNavigate(item.key);
                }}
                aria-current={currentWindow === item.key ? "page" : undefined}
              >
                {item.label}
              </button>
              {index < NAV_ITEMS.length - 1 && <span className="global-top-nav__thin-separator" aria-hidden="true" />}
            </div>
          ))}
        </nav>

        <div className="global-top-nav__right">
          {isAdmin && (
            <button
              type="button"
              className="global-top-nav__admin-btn"
              aria-label="管理员面板"
              aria-haspopup="dialog"
              aria-expanded={adminOpen}
              onClick={() => {
                setProfileOpen(false);
                setLogoutOpen(false);
                setAdminOpen((v) => !v);
              }}
            >
              管理员页
              {pendingCount > 0 && (
                <span className="global-top-nav__admin-dot" aria-label={`${pendingCount}条待处理申请`} />
              )}
            </button>
          )}

          <button
            type="button"
            className="global-top-nav__avatar-btn"
            aria-label="打开用户菜单"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            onClick={() => {
              setAdminOpen(false);
              setLogoutOpen(false);
              setProfileOpen((v) => !v);
            }}
          >
            {avatarDataUrl ? (
              <img src={avatarDataUrl} className="global-top-nav__avatar-image" alt="用户头像" />
            ) : (
              <span className="global-top-nav__avatar-core" aria-hidden="true" />
            )}
          </button>

          <span className="global-top-nav__thick-separator" aria-hidden="true" />

          <button
            type="button"
            className="global-top-nav__logout-trigger"
            onClick={() => {
              setProfileOpen(false);
              setLogoutOpen(true);
            }}
          >
            退出登录
          </button>
        </div>
      </header>

      {profileOpen && (
        <div className="global-top-nav__overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && closeAllPopups()}>
          <ProfileModalLong onClose={closeAllPopups} />
        </div>
      )}

      {adminOpen && isAdmin && (
        <div className="global-top-nav__overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && closeAllPopups()}>
          <AdminModal onClose={closeAllPopups} onPendingCountChange={setPendingCount} />
        </div>
      )}

      {logoutOpen && (
        <div className="global-top-nav__overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && closeAllPopups()}>
          <section className="global-top-nav__logout-modal" role="dialog" aria-modal="true" aria-label="退出登录确认">
            <p className="global-top-nav__logout-title">是否确认退出登录？</p>
            <p className="global-top-nav__logout-subtitle">将会返回登录界面</p>
            <div className="global-top-nav__logout-actions">
              <button type="button" className="global-top-nav__ghost-btn" onClick={closeAllPopups}>
                取消
              </button>
              <button
                type="button"
                className="global-top-nav__danger-btn"
                onClick={() => {
                  closeAllPopups();
                  onLogout?.();
                }}
              >
                确认退出
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
