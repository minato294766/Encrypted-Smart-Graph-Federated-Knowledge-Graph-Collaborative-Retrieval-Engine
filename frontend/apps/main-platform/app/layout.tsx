import "./globals.css";
import "./styles/window-1-login.css";
import "./styles/window-3-main.css";
import "./styles/window-4-database.css";
import "./styles/window-5-macro.css";
import "./styles/global-top-nav.css";
import "./styles/global-watermark.css";
import "cn-fontsource-ding-talk-jin-bu-ti-regular/font.css";
import "@fontsource/zcool-xiaowei";
import "@fontsource/noto-sans-sc";
import "@fontsource/michroma";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WatermarkProvider } from "./components/watermark/WatermarkProvider";
import { AppRuntimeProvider } from "./components/runtime/AppRuntimeProvider";

export const metadata: Metadata = {
  title: "Main Platform",
  description: "Main app for final monorepo"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <WatermarkProvider>
          <AppRuntimeProvider>{children}</AppRuntimeProvider>
        </WatermarkProvider>
      </body>
    </html>
  );
}
