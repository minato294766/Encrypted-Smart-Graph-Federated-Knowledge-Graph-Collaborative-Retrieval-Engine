"use client";

import { useCallback } from "react";
import type { ChatConversationSummary } from "@/app/lib/chat-history-contract";
import { Trash2 } from "lucide-react";

interface ChatHistoryGroupProps {
  title: string;
  items: ChatConversationSummary[];
  activeConversationId: string | null;
  isLoading: boolean;
  loadingConvId?: string | null;
  onSelect: (item: ChatConversationSummary) => void;
  onDelete: (item: ChatConversationSummary) => void;
  formatTime: (iso: string) => string;
}

/**
 * 纯渲染组件，不管理任何动画。
 * 所有布局动画由父组件 ChatInteractionPanel 通过 GSAP Flip 统一编排。
 *
 * 空状态和列表项使用条件渲染（而非 visibility 切换），
 * 这样 Flip 可以正确识别元素的进入（onEnter）和离开（onLeave）。
 */
export function ChatHistoryGroup({
  title,
  items,
  activeConversationId,
  isLoading,
  loadingConvId,
  onSelect,
  onDelete,
  formatTime,
}: ChatHistoryGroupProps) {
  const handleSelect = useCallback(
    (item: ChatConversationSummary) => {
      onSelect(item);
    },
    [onSelect]
  );

  const handleDelete = useCallback(
    (item: ChatConversationSummary, e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(item);
    },
    [onDelete]
  );

  return (
    <section className="chat-history-group" aria-label={title}>
      <p className="chat-history-group-title">{title}</p>
      <div className="chat-history-group-list">
        {/* 空状态 — 条件渲染，Flip 通过 onLeave/onEnter 处理其显隐动画 */}
        {isLoading ? (
          <p className="chat-history-empty">加载中...</p>
        ) : items.length === 0 ? (
          <p className="chat-history-empty">暂无会话</p>
        ) : null}

        {/* 历史记录项 — 条件渲染，Flip 自动追踪进入/离开 */}
        {items.map((item) => (
          <div
            key={item.id}
            data-conversation-id={item.id}
            className={`chat-history-anim-item${activeConversationId === item.id ? " chat-history-anim-item--active" : ""}${loadingConvId === item.id ? " chat-history-anim-item--loading" : ""}`}
          >
            <button
              type="button"
              className="chat-history-item-main"
              onClick={() => { void handleSelect(item); }}
            >
              <span className="chat-history-item-text">{item.title}</span>
              <span className="chat-history-item-time">{formatTime(item.updatedAt)}</span>
            </button>
            <button
              type="button"
              className="chat-history-item-delete"
              aria-label={`删除对话：${item.title}`}
              onClick={(e) => { void handleDelete(item, e); }}
            >
              <Trash2 size={12} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
