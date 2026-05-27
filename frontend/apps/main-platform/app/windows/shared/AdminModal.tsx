"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminListUsers,
  adminListRequests,
  adminListHistory,
  adminApproveRequest,
  type AdminUser,
  type AdminRequest,
  type AdminHistory,
} from "@/app/lib/client/admin-adapter";

interface AdminModalProps {
  onClose: () => void;
  onPendingCountChange?: (count: number) => void;
}

function SectionLoading() {
  return <p className="admin-modal__list-empty">加载中…</p>;
}

interface UserRowProps {
  user: AdminUser;
}

function UserRow({ user }: UserRowProps) {
  return (
    <li className="admin-modal__row admin-modal__row--user">
      <span className="admin-modal__cell admin-modal__cell--account" title={user.account}>{user.account}</span>
      <span className="admin-modal__cell admin-modal__cell--node" title={user.nodeName}>{user.nodeName}</span>
      <span className="admin-modal__cell admin-modal__cell--count">{user.fileCount} 篇</span>
      <span className={`admin-modal__badge${user.nodeType === "中心节点" ? " admin-modal__badge--center" : ""}`}>
        {user.nodeType}
      </span>
    </li>
  );
}

interface RequestRowProps {
  request: AdminRequest;
  onApprove: (id: string) => void;
  approvingId: string | null;
}

function RequestRow({ request, onApprove, approvingId }: RequestRowProps) {
  const isBusy = approvingId === request.id;
  return (
    <li className="admin-modal__row admin-modal__row--request">
      <span className="admin-modal__cell admin-modal__cell--account" title={request.account}>{request.account}</span>
      <span className="admin-modal__cell admin-modal__cell--type">{request.requestType}</span>
      <span className="admin-modal__cell admin-modal__cell--remark" title={request.remark || "无备注"}>
        {request.remark || <em className="admin-modal__empty-remark">无备注</em>}
      </span>
      <span className="admin-modal__cell admin-modal__cell--date">{request.createdAt}</span>
      <button
        type="button"
        className={`admin-modal__approve-btn${isBusy ? " is-loading" : ""}`}
        disabled={approvingId !== null}
        onClick={() => onApprove(request.id)}
        aria-busy={isBusy}
      >
        {isBusy ? "处理中…" : "同意"}
      </button>
    </li>
  );
}

interface HistoryRowProps {
  record: AdminHistory;
  onDelete: (id: string) => void;
}

function HistoryRow({ record, onDelete }: HistoryRowProps) {
  return (
    <li className="admin-modal__row admin-modal__row--history">
      <span className="admin-modal__cell admin-modal__cell--account" title={record.account}>{record.account}</span>
      <span className="admin-modal__cell admin-modal__cell--type">{record.requestType}</span>
      <span className="admin-modal__cell admin-modal__cell--remark" title={record.remark || "无备注"}>
        {record.remark || <em className="admin-modal__empty-remark">无备注</em>}
      </span>
      <span className="admin-modal__cell admin-modal__cell--date">{record.approvedAt}</span>
      <span className="admin-modal__approved-tag">已同意</span>
      <button
        type="button"
        className="admin-modal__delete-btn"
        aria-label="删除此条记录"
        onClick={() => onDelete(record.id)}
      >
        ×
      </button>
    </li>
  );
}

export function AdminModal({ onClose, onPendingCountChange }: AdminModalProps) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [history, setHistory] = useState<AdminHistory[] | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    void adminListUsers().then(setUsers);
    void adminListRequests().then((reqs) => {
      setRequests(reqs);
      onPendingCountChange?.(reqs.length);
    });
    void adminListHistory().then(setHistory);
  }, [onPendingCountChange]);

  const handleDeleteHistory = useCallback((id: string) => {
    setHistory((prev) => prev ? prev.filter((h) => h.id !== id) : prev);
  }, []);

  const handleApprove = useCallback(async (id: string) => {
    setApprovingId(id);
    try {
      const result = await adminApproveRequest(id);
      if (result.ok) {
        const [updatedReqs, updatedHistory] = await Promise.all([
          adminListRequests(),
          adminListHistory(),
        ]);
        setRequests(updatedReqs);
        setHistory(updatedHistory);
        onPendingCountChange?.(updatedReqs.length);
      }
    } finally {
      setApprovingId(null);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <section
      className="global-top-nav__profile-modal global-top-nav__profile-modal--long admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label="管理员操作面板"
    >
      <div className="global-top-nav__profile-content global-top-nav__profile-content--long">
        <header className="global-top-nav__profile-modal-title-wrap">
          <h2 className="global-top-nav__profile-modal-title">管理员面板</h2>
        </header>

        {/* ── Section 1: User info ── */}
        <section className="global-top-nav__section admin-modal__section">
          <h3 className="global-top-nav__panel-title admin-modal__section-title">用户信息</h3>
          <div className="admin-modal__list-header admin-modal__list-header--user">
            <span>账号</span>
            <span>节点名称</span>
            <span>文献量</span>
            <span>类型</span>
          </div>
          <div className="admin-modal__scroll-area">
            {users === null ? (
              <SectionLoading />
            ) : users.length === 0 ? (
              <p className="admin-modal__list-empty">暂无用户</p>
            ) : (
              <ul className="admin-modal__list">
                {users.map((u) => (
                  <UserRow key={u.account} user={u} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Section 2: Pending requests ── */}
        <section className="global-top-nav__section admin-modal__section">
          <h3 className="global-top-nav__panel-title admin-modal__section-title">
            用户申请
            {requests !== null && requests.length > 0 && (
              <span className="admin-modal__pending-badge">{requests.length}</span>
            )}
          </h3>
          <div className="admin-modal__list-header admin-modal__list-header--request">
            <span>账号</span>
            <span>申请类型</span>
            <span>备注</span>
            <span>日期</span>
            <span>操作</span>
          </div>
          <div className="admin-modal__scroll-area">
            {requests === null ? (
              <SectionLoading />
            ) : requests.length === 0 ? (
              <p className="admin-modal__list-empty">暂无待处理申请</p>
            ) : (
              <ul className="admin-modal__list">
                {requests.map((r) => (
                  <RequestRow
                    key={r.id}
                    request={r}
                    onApprove={(id) => void handleApprove(id)}
                    approvingId={approvingId}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Section 3: History ── */}
        <section className="global-top-nav__section admin-modal__section">
          <h3 className="global-top-nav__panel-title admin-modal__section-title">历史记录</h3>
          <div className="admin-modal__list-header admin-modal__list-header--history">
            <span>账号</span>
            <span>申请类型</span>
            <span>备注</span>
            <span>处理日期</span>
            <span>状态</span>
          </div>
          <div className="admin-modal__scroll-area">
            {history === null ? (
              <SectionLoading />
            ) : history.length === 0 ? (
              <p className="admin-modal__list-empty">暂无历史记录</p>
            ) : (
              <ul className="admin-modal__list">
                {history.map((h) => (
                  <HistoryRow key={h.id} record={h} onDelete={handleDeleteHistory} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
