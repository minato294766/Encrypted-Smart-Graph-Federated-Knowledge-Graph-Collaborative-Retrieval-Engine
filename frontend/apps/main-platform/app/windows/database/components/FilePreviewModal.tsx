"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { X, Download, File } from "lucide-react";
import { openFileWithSystem } from "@/app/lib/desktop-file-bridge";

interface FilePreviewModalProps {
  file: File;
  name: string;
  addedAt?: string;
  highlightPhrases?: string[];
  onClose: () => void;
}

interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveHighlightTargets(content: string, phrases: string[]): string[] {
  const targets: string[] = [];
  const pushIfMatch = (candidate: string) => {
    const next = candidate.trim();
    if (!next || next.length < 12) return;
    if (!content.includes(next)) return;
    if (targets.includes(next)) return;
    targets.push(next);
  };

  phrases.forEach((phrase) => {
    const raw = phrase.trim();
    if (!raw) return;

    pushIfMatch(raw);
    pushIfMatch(raw.replace(/……+$/g, ""));
    pushIfMatch(raw.replace(/[。！？；，、]+$/g, ""));
  });

  return targets.sort((a, b) => b.length - a.length);
}

function buildHighlightedSegments(content: string, phrases: string[]): HighlightSegment[] {
  const normalized = resolveHighlightTargets(content, phrases);

  if (!normalized.length) {
    return [{ text: content, highlighted: false }];
  }

  const matcher = new RegExp(`(${normalized.map((item) => escapeRegExp(item)).join("|")})`, "g");
  return content
    .split(matcher)
    .filter((segment) => segment.length > 0)
    .map((segment) => ({
      text: segment,
      highlighted: normalized.includes(segment),
    }));
}

function detectFileCategory(file: File): "text" | "image" | "video" | "audio" | "pdf" | "other" {
  const mime = file.type ?? "";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime.startsWith("text/") ||
    ["txt", "md", "csv", "json", "xml", "html", "css", "js", "ts", "jsx",
     "tsx", "rtf", "log", "ini", "yaml", "yml", "toml", "sh", "py", "java",
     "c", "cpp", "h", "rs", "go", "rb", "php", "sql"].includes(ext)
  ) {
    return "text";
  }
  return "other";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const TEXT_PREVIEW_LIMIT = 64 * 1024; // 64 KB text preview cap

export function FilePreviewModal({ file, name, addedAt, highlightPhrases = [], onClose }: FilePreviewModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef  = useRef<HTMLDivElement>(null);

  const category = detectFileCategory(file);
  const [objectUrl,   setObjectUrl]   = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [openResult,  setOpenResult]  = useState<{ ok: boolean; message: string } | null>(null);
  const [isOpening,   setIsOpening]   = useState(false);

  const highlightedSegments = useMemo(() => {
    if (category !== "text" || textContent === null) return [];
    return buildHighlightedSegments(textContent, highlightPhrases);
  }, [category, highlightPhrases, textContent]);

  // Create object URL for binary previews
  useEffect(() => {
    if (category === "image" || category === "video" || category === "audio" || category === "pdf") {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, category]);

  // Read text content
  useEffect(() => {
    if (category !== "text") return;
    const slice = file.slice(0, TEXT_PREVIEW_LIMIT);
    const reader = new FileReader();
    reader.onload = (e) => setTextContent((e.target?.result as string) ?? "");
    reader.onerror = () => setTextContent("[读取文件内容失败]");
    reader.readAsText(slice, "utf-8");
  }, [file, category]);

  // Entrance animation
  useEffect(() => {
    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!overlay || !modal) return;
    gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.22, ease: "power2.out" });
    gsap.fromTo(modal,
      { autoAlpha: 0, y: 24, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out", delay: 0.04 },
    );
  }, []);

  const handleClose = useCallback(() => {
    const overlay = overlayRef.current;
    const modal = modalRef.current;
    if (!overlay || !modal) { onClose(); return; }
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(modal,   { autoAlpha: 0, y: 16, scale: 0.97, duration: 0.2, ease: "power2.in" }, 0);
    tl.to(overlay, { autoAlpha: 0, duration: 0.22 }, 0);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  const handleOpenFile = useCallback(async () => {
    setIsOpening(true);
    setOpenResult(null);
    // In Electron, File objects may have a `.path` property
    const localPath = (file as unknown as { path?: string }).path ?? "";
    const result = await openFileWithSystem(localPath, file, name);
    setOpenResult({ ok: result.ok, message: result.ok ? result.message : result.error });
    setIsOpening(false);
  }, [file, name]);

  const fileSizeLabel = formatFileSize(file.size);
  const fileMimeLabel = file.type || "未知类型";

  return (
    <div
      ref={overlayRef}
      className="db-preview-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        ref={modalRef}
        className="db-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`文件预览：${name}`}
      >
        {/* ── Header ── */}
        <div className="db-preview-header">
          <div className="db-preview-header-info">
            <p className="db-modal-eyebrow">
              FILE PREVIEW · {fileSizeLabel}
              {addedAt ? ` · ${addedAt}` : ""}
            </p>
            <h3 className="db-preview-title">{name}</h3>
            <p className="db-preview-mime">{fileMimeLabel}</p>
          </div>
          <button
            className="db-preview-close"
            onClick={handleClose}
            aria-label="关闭预览"
            type="button"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* ── Content body ── */}
        <div className="db-preview-body">
          {category === "text" && textContent !== null && (
            <pre className="db-preview-text">
              {highlightedSegments.length > 0
                ? highlightedSegments.map((segment, index) => (
                  <span key={`db-preview-segment-${index}`}>
                    {segment.highlighted ? (
                      <mark className="db-preview-highlight">{segment.text}</mark>
                    ) : (
                      segment.text
                    )}
                  </span>
                ))
                : textContent}
              {file.size > TEXT_PREVIEW_LIMIT && (
                <span className="db-preview-truncate-notice">
                  {"\n\n"}[仅显示前 64 KB，完整内容请点击「下载文件」]
                </span>
              )}
            </pre>
          )}

          {category === "text" && textContent === null && (
            <div className="db-preview-loading">正在读取文件内容…</div>
          )}

          {category === "image" && objectUrl && (
            <div className="db-preview-image-wrap">
              <img src={objectUrl} alt={name} className="db-preview-image" />
            </div>
          )}

          {category === "video" && objectUrl && (
            <div className="db-preview-video-wrap">
              <video controls src={objectUrl} className="db-preview-video">
                您的浏览器不支持视频预览。
              </video>
            </div>
          )}

          {category === "audio" && objectUrl && (
            <div className="db-preview-audio-wrap">
              <File size={48} strokeWidth={1} className="db-preview-audio-icon" />
              <p className="db-preview-audio-name">{name}</p>
              <audio controls src={objectUrl} className="db-preview-audio" />
            </div>
          )}

          {category === "pdf" && objectUrl && (
            <iframe
              src={objectUrl}
              className="db-preview-pdf"
              title={name}
            />
          )}

          {category === "other" && (
            <div className="db-preview-unsupported">
              <File size={48} strokeWidth={1} aria-hidden="true" />
              <p className="db-preview-unsupported-text">暂不支持此文件类型的内嵌预览</p>
              <p className="db-preview-unsupported-meta">{name}&nbsp;·&nbsp;{fileMimeLabel}</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="db-preview-footer">
          {openResult && (
            <p
              className={`db-open-result ${openResult.ok ? "db-open-result--ok" : "db-open-result--err"}`}
              role="status"
            >
              {openResult.message}
            </p>
          )}
          <div className="db-preview-footer-btns">
            <button
              className="db-preview-open-btn"
              onClick={handleOpenFile}
              type="button"
              disabled={isOpening}
              aria-busy={isOpening}
            >
              <Download size={14} strokeWidth={2} />
              {isOpening ? "下载中…" : "下载文件"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
