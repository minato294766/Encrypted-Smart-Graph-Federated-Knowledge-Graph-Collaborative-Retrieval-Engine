# AGENTS.md（Window 4：交互对话）

## 作用域
本文件作用于 `apps/main-platform/app/windows/main` 目录树。

## 模块职责
- `MainWindow.tsx`：Window 4 总编排与主流程切换。
- `components/ChatInteractionPanel.tsx`：对话输入/输出、模型配置交互。
- `components/TraceWindow.tsx`：溯源页容器与流程。
- `components/TraceKnowledgeGraph.tsx`：知识图谱可视化。
- `components/*.tsx` 其余文件：画布线条/装饰与局部可视层。

## 开发规则
1. 回答主流程变更优先落在 `ChatInteractionPanel.tsx` 与其服务调用层。
2. 溯源逻辑与对话主循环分层，避免互相污染状态。
3. 任何“模式切换”逻辑需保证状态可预测，不允许隐式副作用。

## 扩展性审查重点
- 新增回答模式（本地/全局/混合）是否可插拔；
- 新增模型配置项是否无需修改大量 UI 分支；
- 对话、溯源、图谱是否维持清晰边界。
