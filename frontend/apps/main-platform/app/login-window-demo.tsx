"use client";

/**
 * LoginWindowDemo — 顶层窗口编排入口
 *
 * 职责：
 *   1. 维护当前激活窗口（login | main | database | macro）
 *   2. 将切换回调分发给子窗口
 *   3. 不包含任何动画或业务逻辑
 *
 * 子窗口位置：
 *   - 第一窗口（登录/介绍）:  ./windows/login/LoginIntroWindow
 *   - 第三窗口（交互对话）:   ./windows/main/MainWindow
 *   - 第四窗口（数据库）:     ./windows/database/DatabaseWindow
 *   - 第五窗口（宏观平台）:   ./windows/macro/MacroWindow
 */

import { useState, type ReactNode } from "react";
import { useAppRuntime } from "./components/runtime/AppRuntimeProvider";
import { LoginIntroWindow } from "./windows/login/LoginIntroWindow";
import { MainWindow } from "./windows/main/MainWindow";
import { DatabaseWindow } from "./windows/database/DatabaseWindow";
import { MacroWindow } from "./windows/macro/MacroWindow";
import { WatermarkOverlay } from "./components/watermark/WatermarkOverlay";
import { useWatermark } from "./components/watermark/WatermarkProvider";

type ActiveWindow = "login" | "main" | "database" | "macro";

export function LoginWindowDemo() {
  const [activeWindow, setActiveWindow] = useState<ActiveWindow>("login");
  const [loginRenderKey, setLoginRenderKey] = useState(0);
  const { watermarkName } = useWatermark();
  const { setIsAdmin, setUsername } = useAppRuntime();

  const renderWithWatermark = (content: ReactNode) => (
    <>
      {content}
      <WatermarkOverlay text={watermarkName} />
    </>
  );

  const handleOpenDatabase = () => setActiveWindow("database");
  const handleOpenMacro = () => setActiveWindow("macro");

  const handleBackToLogin = () => {
    setIsAdmin(false);
    // 清除 localStorage 中的运行时状态（模型配置等）
    if (typeof window !== "undefined") {
      localStorage.removeItem("main-platform-runtime-profile-v1");
      localStorage.removeItem("mia_rag_token");
    }
    setActiveWindow("login");
    // Force re-mount so the intro animation replays from scratch.
    setLoginRenderKey((v) => v + 1);
  };

  const handleSignIn = (isAdmin: boolean, account: string) => {
    setIsAdmin(isAdmin);
    setUsername(account);
    handleOpenMacro();
  };

  if (activeWindow === "macro") {
    return renderWithWatermark(
      <MacroWindow
        onBack={handleBackToLogin}
        onNavigateToMain={() => setActiveWindow("main")}
        onOpenDatabase={handleOpenDatabase}
      />
    );
  }

  if (activeWindow === "database") {
    return renderWithWatermark(
      <DatabaseWindow
        onBack={handleBackToLogin}
        onNavigateToMain={() => setActiveWindow("main")}
        onOpenMacro={handleOpenMacro}
      />
    );
  }

  if (activeWindow === "main") {
    return renderWithWatermark(
      <MainWindow
        onBack={handleBackToLogin}
        onOpenDatabase={handleOpenDatabase}
        onOpenMacro={handleOpenMacro}
      />
    );
  }

  return <LoginIntroWindow key={loginRenderKey} onSignIn={handleSignIn} />;
}
