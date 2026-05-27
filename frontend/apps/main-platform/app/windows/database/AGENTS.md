# AGENTS.md（Window 3：数据库）

## 作用域
本文件作用于 `apps/main-platform/app/windows/database` 目录树。

## 模块职责
- `DatabaseWindow.tsx`：聚类列表页与入口态编排。
- `components/ClusterDetailWindow.tsx`：聚类详情、文件上传、文件操作。
- `components/FilePreviewModal.tsx`：文件预览弹窗。

## 开发规则
1. 列表态与详情态的状态边界要清晰，避免双向隐式改写。
2. 文件上传/删除流程需明确 optimistic 与回写策略。
3. 接口交互失败必须有可读反馈，不得静默失败。

## 扩展性审查重点
- 增加文件类型时是否无需改动多处分支；
- 增加批量操作时是否复用已有流程；
- 数据拉取策略是否可承载更大文件量与并发操作。
