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
import {
  ArrowLeft,
  Upload,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  File,
  FolderOpen,
} from "lucide-react";
import { FilePreviewModal } from "./FilePreviewModal";
import type { Cluster } from "@/app/lib/database-types";
import type {
  AddClusterFileRequest,
  AddClusterFileResponse,
  ClusterFile,
  DeleteClusterFileRequest,
  GetClusterFileResponse,
  ListClusterFilesResponse,
} from "@/app/lib/cluster-files-contract";
import { buildNodeAuthContext, createNodeAuthHeaders } from "@/app/lib/client/node-auth-headers";

// ── Local file model ──────────────────────────────────────────────────────────

interface LocalFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  addedAt: string;
  fileObject: File;
  hasInlineContent: boolean;
}

// ── File type groups for the upload bubble ───────────────────────────────────

const FILE_TYPE_GROUPS = [
  {
    label: "文档",
    labelEn: "DOC",
    Icon: FileText,
    accept: ".pdf,.txt,.doc,.docx,.rtf,.md,.csv,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp",
  },
  {
    label: "图片",
    labelEn: "IMG",
    Icon: ImageIcon,
    accept: ".jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.tiff,.avif,.heic",
  },
  {
    label: "视频",
    labelEn: "VID",
    Icon: Video,
    accept: ".mp4,.webm,.mov,.avi,.mkv,.flv,.wmv,.m4v",
  },
  {
    label: "音频",
    labelEn: "AUD",
    Icon: Music,
    accept: ".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,.opus",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv", rtf: "application/rtf",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
    svg: "image/svg+xml", tiff: "image/tiff",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    avi: "video/x-msvideo", mkv: "video/x-matroska",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
  };
  return map[ext] ?? "application/octet-stream";
}

function FileTypeIcon({ mimeType, name }: { mimeType: string; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/") || ["jpg","jpeg","png","webp","gif","svg","bmp"].includes(ext))
    return <ImageIcon size={16} strokeWidth={1.5} />;
  if (mimeType.startsWith("video/") || ["mp4","webm","mov","avi","mkv"].includes(ext))
    return <Video size={16} strokeWidth={1.5} />;
  if (mimeType.startsWith("audio/") || ["mp3","wav","ogg","flac","aac","m4a"].includes(ext))
    return <Music size={16} strokeWidth={1.5} />;
  if (mimeType === "application/pdf" || ext === "pdf")
    return <FileText size={16} strokeWidth={1.5} />;
  if (mimeType.startsWith("text/") || ["txt","md","csv","doc","docx","xls","xlsx"].includes(ext))
    return <FileText size={16} strokeWidth={1.5} />;
  return <File size={16} strokeWidth={1.5} />;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClusterDetailWindowProps {
  cluster: Cluster;
  accountName: string;
  isSelfCenterNode: boolean;
  onBack: () => void;
  onFilesChanged?: () => void | Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

function base64ToBuffer(base64: string): ArrayBuffer {
  if (typeof window === "undefined") return new ArrayBuffer(0);
  const binary = window.atob(base64);
  const len = binary.length;
  const buffer = new ArrayBuffer(len);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < len; i += 1) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof window === "undefined") return "";
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return window.btoa(binary);
}

function toLocalFile(record: ClusterFile): LocalFile {
  const mimeType = record.mimeType || getMimeFromName(record.name);
  const hasInlineContent = record.textContent != null || Boolean(record.contentBase64);

  let blob: Blob;
  if (record.textContent != null) {
    blob = new Blob([record.textContent], { type: mimeType });
  } else if (record.contentBase64) {
    const buffer = base64ToBuffer(record.contentBase64);
    blob = new Blob([buffer], { type: mimeType });
  } else {
    blob = new Blob([], { type: mimeType });
  }

  const fileObject = new globalThis.File([blob], record.name, { type: mimeType });

  return {
    id: record.id,
    name: record.name,
    size: record.size,
    mimeType,
    addedAt: record.addedAt,
    fileObject,
    hasInlineContent,
  };
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "yaml", "yml", "log", "ini", "toml", "html", "css", "js", "ts", "tsx", "jsx",
]);

function shouldPersistAsText(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

export function ClusterDetailWindow({
  cluster,
  accountName,
  isSelfCenterNode,
  onBack,
  onFilesChanged,
}: ClusterDetailWindowProps) {
  const rootRef        = useRef<HTMLDivElement>(null);
  const listHeaderRef  = useRef<HTMLElement>(null);
  const listBodyRef    = useRef<HTMLDivElement>(null);
  const uploadBtnRef   = useRef<HTMLButtonElement>(null);
  const bubbleRef      = useRef<HTMLDivElement>(null);
  const fileInputRefs  = useRef<Array<HTMLInputElement | null>>(
    Array.from({ length: FILE_TYPE_GROUPS.length }, () => null),
  );

  const [files, setFiles]               = useState<LocalFile[]>([]);
  const [showBubble, setShowBubble]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<LocalFile | null>(null);
  const [deleteTargetFile, setDeleteTargetFile] = useState<LocalFile | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [previewLoadingFileId, setPreviewLoadingFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const resolvedAccount = (accountName || "").trim() || "本机节点";
  const accountQuery = encodeURIComponent(resolvedAccount);
  const authHeaders = useMemo(
    () => createNodeAuthHeaders(buildNodeAuthContext({
      account: resolvedAccount,
      isSelfCenterNode,
    })),
    [isSelfCenterNode, resolvedAccount],
  );

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/database/clusters/${cluster.id}/files?account=${accountQuery}`, {
        headers: authHeaders,
      });
      if (!res.ok) return;
      const data = await res.json() as ListClusterFilesResponse;
      setFiles(data.files.map(toLocalFile));
    } catch {
      // ignore network failure, keep current view
    }
  }, [accountQuery, authHeaders, cluster.id]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const ensureFileForPreview = useCallback(async (target: LocalFile): Promise<LocalFile> => {
    if (target.hasInlineContent) return target;

    try {
      const res = await fetch(`/api/database/clusters/${cluster.id}/files/${target.id}?account=${accountQuery}`, {
        headers: authHeaders,
      });
      if (!res.ok) return target;
      const data = await res.json() as GetClusterFileResponse;
      const hydrated = toLocalFile(data.file);
      setFiles((prev) => prev.map((item) => (item.id === hydrated.id ? hydrated : item)));
      return hydrated;
    } catch {
      return target;
    }
  }, [accountQuery, authHeaders, cluster.id]);

  const handleOpenPreview = useCallback(async (target: LocalFile) => {
    if (previewLoadingFileId) return;
    setPreviewLoadingFileId(target.id);
    const resolved = await ensureFileForPreview(target);
    setSelectedFile(resolved);
    setPreviewLoadingFileId(null);
  }, [ensureFileForPreview, previewLoadingFileId]);

  // ── Entrance: slide-in from right then draw line + fade list header ────────
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    gsap.set(root, { x: "100%" });

    const tl = gsap.timeline();
    tl.to(root, { x: "0%", duration: 0.45, ease: "power3.out" });

    if (listHeaderRef.current) {
      gsap.set(listHeaderRef.current, { autoAlpha: 0 });
      tl.to(listHeaderRef.current, { autoAlpha: 1, duration: 0.28, ease: "power2.out" }, 0.62);
    }

    return () => { tl.kill(); };
  }, []);

  // ── Exit: slide out to the right ──────────────────────────────────────────
  const handleBack = useCallback(() => {
    const root = rootRef.current;
    if (!root) { onBack(); return; }
    gsap.to(root, { x: "100%", duration: 0.35, ease: "power3.in", onComplete: onBack });
  }, [onBack]);

  // ── Upload bubble open/close ───────────────────────────────────────────────
  const openBubble = useCallback(() => {
    setShowBubble(true);
  }, []);

  // Animate in when bubble mounts
  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || !showBubble) return;
    gsap.fromTo(bubble,
      { autoAlpha: 0, y: -10, scale: 0.92 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.22, ease: "power2.out" },
    );
  }, [showBubble]);

  // Close bubble on outside click
  useEffect(() => {
    if (!showBubble) return;
    const handler = (e: MouseEvent) => {
      const btn    = uploadBtnRef.current;
      const bubble = bubbleRef.current;
      if (
        btn    && !btn.contains(e.target as Node) &&
        bubble && !bubble.contains(e.target as Node)
      ) {
        setShowBubble(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBubble]);

  // Escape behavior: close bubble/modal first, then back to list
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat || e.defaultPrevented) return;
      if (showBubble) {
        setShowBubble(false);
        return;
      }
      if (selectedFile) {
        setSelectedFile(null);
        return;
      }
      if (deleteTargetFile && !isDeletingFile) {
        setDeleteTargetFile(null);
        return;
      }
      handleBack();
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [deleteTargetFile, handleBack, isDeletingFile, selectedFile, showBubble]);

  // ── Handle file selection from any hidden input ────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;

    const selected = Array.from(list);
    if (selected.length === 0) {
      setUploadError("未读取到所选文件，请重试");
      return;
    }

    setShowBubble(false);
    setUploadError(null);
    e.target.value = "";
    const uploadTasks = selected.map(async (file) => {
      const mimeType = file.type || getMimeFromName(file.name);
      let textContent: string | undefined;
      let contentBase64: string | undefined;

      if (shouldPersistAsText(file)) {
        textContent = await file.text();
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        contentBase64 = bytesToBase64(bytes);
      }

      const payload: AddClusterFileRequest = {
        name: file.name,
        size: file.size,
        mimeType,
        textContent,
        contentBase64,
        account: resolvedAccount,
      };

      const res = await fetch(`/api/database/clusters/${cluster.id}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let reason = "上传失败";
        try {
          const data = await res.json() as { error?: string };
          if (data.error) reason = data.error;
        } catch {
          // ignore non-json error body
        }
        throw new Error(`${reason}（HTTP ${res.status}）`);
      }
      const data = await res.json() as AddClusterFileResponse;
      const uploaded: LocalFile = {
        id: data.file.id,
        name: file.name,
        size: file.size,
        mimeType,
        addedAt: data.file.addedAt,
        fileObject: file,
        hasInlineContent: true,
      };

      setFiles((prev) => {
        if (prev.some((existing) => existing.id === uploaded.id)) return prev;
        return [...prev, uploaded];
      });

      return true;
    });

    const uploadResults = await Promise.all(uploadTasks.map((task) =>
      task.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "上传失败";
        setUploadError((prev) => prev ?? message);
        return false;
      }),
    ));
    const uploadedCount = uploadResults.filter(Boolean).length;
    if (uploadedCount === 0) {
      setUploadError((prev) => prev ?? "上传失败：未收到服务端成功响应，请重试");
    } else if (uploadedCount < selected.length) {
      setUploadError(`部分文件上传失败：成功 ${uploadedCount} / ${selected.length}`);
    }

    void fetchFiles();
    if (onFilesChanged) {
      await onFilesChanged();
    }
  }, [authHeaders, cluster.id, fetchFiles, onFilesChanged, resolvedAccount]);

  const handleConfirmDeleteFile = useCallback(async () => {
    if (!deleteTargetFile) return;
    setIsDeletingFile(true);
    try {
      const payload: DeleteClusterFileRequest = {
        account: resolvedAccount,
      };
      const res = await fetch(`/api/database/clusters/${cluster.id}/files/${deleteTargetFile.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      if (selectedFile?.id === deleteTargetFile.id) {
        setSelectedFile(null);
      }
      setDeleteTargetFile(null);
      await fetchFiles();
      if (onFilesChanged) {
        await onFilesChanged();
      }
    } finally {
      setIsDeletingFile(false);
    }
  }, [authHeaders, cluster.id, deleteTargetFile, fetchFiles, onFilesChanged, resolvedAccount, selectedFile?.id]);

  // ── Animate each new file row ──────────────────────────────────────────────
  useEffect(() => {
    if (files.length === 0) return;
    const rows = listBodyRef.current?.querySelectorAll(".db-file-row");
    if (!rows) return;
    const last = rows[rows.length - 1];
    if (last) {
      gsap.fromTo(last,
        { autoAlpha: 0, x: 24 },
        { autoAlpha: 1, x: 0, duration: 0.32, ease: "power2.out" },
      );
    }
  }, [files]);

  return (
    <div ref={rootRef} className="db-cluster-detail">

      {/* ── Detail header ── */}
      <header className="db-cluster-detail-header">

        {/* Title block */}
        <div className="db-cluster-detail-title-block">
          <p className="db-cluster-detail-eyebrow">
            CLUSTER&nbsp;·&nbsp;{cluster.createdAt}
          </p>
          <h1 className="db-cluster-detail-title">{cluster.name}</h1>
        </div>

      </header>

      {/* ── File list ── */}
      <section className="db-file-list-section">
        <header ref={listHeaderRef} className="db-file-list-header">
          <div className="db-file-list-header-left">
            <p className="db-list-eyebrow">FILE INDEX</p>
            <div className="db-list-title-row">
              <h2 className="db-list-title">已添加文件</h2>
              <span className="db-list-count">{files.length} 个文件</span>
            </div>
          </div>

          <div className="db-file-list-header-right">
            <div className="db-upload-wrapper">
              <button
                ref={uploadBtnRef}
                className="db-upload-btn"
                onClick={openBubble}
                type="button"
                aria-haspopup="true"
                aria-expanded={showBubble}
              >
                <Upload size={14} strokeWidth={2} />
                上传文件
              </button>

              {showBubble && (
                <div
                  ref={bubbleRef}
                  className="db-type-bubble"
                  role="menu"
                  aria-label="选择文件类型"
                >
                  {FILE_TYPE_GROUPS.map(({ label, labelEn, Icon }, idx) => (
                    <button
                      key={label}
                      className="db-type-bubble-item"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setShowBubble(false);
                        setTimeout(() => fileInputRefs.current[idx]?.click(), 60);
                      }}
                    >
                      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                      <span className="db-type-bubble-label">{label}</span>
                      <span className="db-type-bubble-en">{labelEn}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Hidden file inputs — one per type group */}
            {FILE_TYPE_GROUPS.map(({ label, accept }, idx) => (
              <input
                key={label}
                ref={(el) => { fileInputRefs.current[idx] = el; }}
                type="file"
                accept={accept}
                multiple
                className="db-file-input-hidden"
                onChange={handleFileChange}
                aria-hidden="true"
                tabIndex={-1}
              />
            ))}

            <button
              className="db-back-btn"
              onClick={handleBack}
              type="button"
              aria-label="返回聚类列表"
            >
              <ArrowLeft size={14} strokeWidth={2} />
              返回列表
            </button>
          </div>
        </header>

        <div ref={listBodyRef} className="db-list-body" role="list">
          {uploadError && (
            <div className="db-list-empty" role="status" aria-live="polite">
              <span>{uploadError}</span>
            </div>
          )}
          {files.length === 0 ? (
            <div className="db-list-empty" role="listitem">
              <FolderOpen size={24} strokeWidth={1} aria-hidden="true" />
              <span>暂无文件 — 点击「上传文件」开始添加</span>
            </div>
          ) : (
            files.map((f) => (
              <div
                key={f.id}
                className="db-file-row"
                role="listitem"
                tabIndex={0}
                onClick={() => void handleOpenPreview(f)}
                onKeyDown={(e) => e.key === "Enter" && void handleOpenPreview(f)}
                aria-label={`打开文件：${f.name}`}
                aria-busy={previewLoadingFileId === f.id}
              >
                <div className="db-file-icon" aria-hidden="true">
                  <FileTypeIcon mimeType={f.mimeType} name={f.name} />
                </div>
                <span className="db-file-name">{f.name}</span>
                <span className="db-file-meta">{formatFileSize(f.size)}</span>
                <span className="db-file-date">{f.addedAt}</span>
                <button
                  className="db-file-delete-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTargetFile(f);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`删除文件：${f.name}`}
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── File preview modal ── */}
      {selectedFile && (
        <FilePreviewModal
          file={selectedFile.fileObject}
          name={selectedFile.name}
          addedAt={selectedFile.addedAt}
          onClose={() => setSelectedFile(null)}
        />
      )}

      {deleteTargetFile && (
        <div
          className="db-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingFile) {
              setDeleteTargetFile(null);
            }
          }}
        >
          <div
            className="db-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="db-delete-file-title"
          >
            <div className="db-modal-header">
              <p className="db-modal-eyebrow">FILE · DELETE</p>
              <h3 id="db-delete-file-title" className="db-modal-title db-modal-title--danger">
                删除文件
              </h3>
            </div>
            <div className="db-modal-body">
              <p className="db-modal-desc">
                确认删除文件《{deleteTargetFile.name}》？删除后不可恢复。
              </p>
            </div>
            <div className="db-modal-footer">
              <button
                className="db-modal-cancel"
                onClick={() => setDeleteTargetFile(null)}
                type="button"
                disabled={isDeletingFile}
              >
                取消
              </button>
              <button
                className="db-modal-confirm db-modal-confirm--danger"
                onClick={handleConfirmDeleteFile}
                type="button"
                disabled={isDeletingFile}
                aria-busy={isDeletingFile}
              >
                {isDeletingFile ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
