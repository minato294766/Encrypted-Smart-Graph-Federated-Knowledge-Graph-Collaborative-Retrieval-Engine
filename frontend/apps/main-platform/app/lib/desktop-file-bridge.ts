// Desktop file bridge — wraps Electron/Tauri IPC so React components never import
// desktop-specific APIs directly. In a pure web context this module gracefully falls back.
//
// Electron setup (preload.js):
//   const { contextBridge, ipcRenderer } = require("electron");
//   contextBridge.exposeInMainWorld("desktopBridge", {
//     openPath: (path) => ipcRenderer.invoke("open-path", path),
//   });
//
// Electron main process:
//   const { ipcMain, shell } = require("electron");
//   ipcMain.handle("open-path", (_event, p) => shell.openPath(p));

declare global {
  interface Window {
    desktopBridge?: {
      openPath: (path: string) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

export type OpenFileResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const OPEN_FILE_FEEDBACK_DELAY_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function downloadInBrowser(file: File, fallbackName?: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fallbackName?.trim() || file.name || "download";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return true;
}

export function isDesktopBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.desktopBridge?.openPath === "function"
  );
}

/**
 * Ask the system to open the file at `localPath` with the default application.
 */
export async function openFileWithSystem(
  localPath: string,
  fallbackFile?: File,
  fallbackName?: string,
): Promise<OpenFileResult> {
  if (!isDesktopBridgeAvailable() || !localPath) {
    if (fallbackFile && downloadInBrowser(fallbackFile, fallbackName)) {
      return {
        ok: true,
        message: "已触发浏览器下载",
      };
    }

    return {
      ok: false,
      error: "当前运行环境不支持系统打开文件",
    };
  }

  const res = await window.desktopBridge!.openPath(localPath);
  await delay(OPEN_FILE_FEEDBACK_DELAY_MS);
  if (res.ok) return { ok: true, message: "已在系统默认程序中打开" };
  return { ok: false, error: res.error ?? "系统无法打开此文件" };

}
