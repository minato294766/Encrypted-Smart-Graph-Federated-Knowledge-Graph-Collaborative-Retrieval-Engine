import type { ReactNode } from "react";

type WindowCardProps = {
  title: string;
  children?: ReactNode;
};

export function WindowCard({ title, children }: WindowCardProps) {
  return (
    <section
      style={{
        width: "100%",
        maxWidth: 720,
        borderRadius: 14,
        border: "1px solid #1f2a44",
        background:
          "linear-gradient(180deg, rgba(18, 28, 53, 0.95), rgba(12, 19, 37, 0.95))",
        color: "#e7ecff",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)"
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid #1f2a44"
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
        <strong style={{ marginLeft: 4, fontWeight: 600 }}>{title}</strong>
      </header>
      <div style={{ padding: 16, lineHeight: 1.6 }}>{children}</div>
    </section>
  );
}
