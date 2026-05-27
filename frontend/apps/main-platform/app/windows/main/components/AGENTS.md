# AGENTS.md（Window 4 组件目录）

## 作用域
本文件作用于 `apps/main-platform/app/windows/main/components/` 目录。

## 目录职责总览

| 文件 | 职责 |
|------|------|
| `ChatInteractionPanel.tsx` | Window 4 核心：聊天交互、历史记录、模型配置编排 |
| `ChatHistoryGroup.tsx` | 历史记录纯渲染组件；**不管理状态，不管理动画** |
| `ChatCanvasLines.tsx` | SVG 画布线条装饰（MAIN_CANVAS 坐标驱动） |
| `ModelConfigCanvasLines.tsx` | 模型配置面板画布线条（MC_CANVAS 坐标驱动） |
| `DotGrid.tsx` | 交互点阵背景（InertiaPlugin） |
| `TraceWindow.tsx` | 溯源窗口全屏覆盖层 |
| `TraceKnowledgeGraph.tsx` | vis-network 知识图谱（懒加载脚本） |

## 强制规则

1. **ChatHistoryGroup 是纯渲染层**
   - 不得在其中直接 `fetch` 或调用 API。
   - 不得持有 `useRef` 动画逻辑；所有 GSAP 编排统一在 `ChatInteractionPanel` 完成。
   - 仅通过 props 接收数据与回调。

2. **动画时序约束（ChatInteractionPanel）**
   - 历史列表 Flip 动画：`captureFlipState()` 必须在 `setConversations()` 之前调用；
     `useLayoutEffect` 负责执行 `Flip.from()`，不得改回 `useGSAP` + `requestAnimationFrame` 模式。
   - 删除确认弹窗通过 `createPortal(…, document.body)` 渲染，不得内嵌回 `.chat-interaction-layer`，
     否则会被 z-index:6 的堆叠上下文困住，无法显示在全局导航栏（z-index:180）之上。

3. **会话 ID 生命周期**
   - `activeConversationIdRef` 与 `activeConversationId` 状态必须保持同步；
     发生 "Conversation not found" 错误时必须同时重置两者，不得只重置状态而遗漏 ref。
   - `persistTurn` 遇到 404 时降级为"新建会话"，不得直接弹 toast 后静默放弃。

4. **存储模式**
   - 禁止在组件层直接判断 mock/Prisma 模式；由服务层 `CHAT_HISTORY_STORAGE_MODE` 统一控制。
   - 组件只消费 API 响应，不感知底层存储实现。

5. **新增组件门槛**
   - 若新组件跨越 Window 4 边界被多个窗口复用，必须迁移至 `app/windows/shared/`。
   - 若新组件承担 API 通信，必须先在 `app/api/` 下声明对应 Route Handler。

## 文件数量警戒线
本目录当前有 **7 个组件文件**。新增文件前需评估是否应归入 `shared/` 或合并到现有文件。
