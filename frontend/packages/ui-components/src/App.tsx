import { WindowCard } from "./components/WindowCard";

export default function App() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <WindowCard title="Component Lab">
        当前是 `packages/ui-components` 的 Vite 预览环境，你可以在这里逐步开发窗口组件。
      </WindowCard>
    </main>
  );
}
