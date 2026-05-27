# AGENTS.md（apps/main-platform）

## 作用域
本文件作用于 `apps/main-platform` 目录树。

## 模块边界
- `app/windows/**`：窗口 UI 与交互编排。
- `app/api/**`：Next.js Route Handlers（BFF / API）。
- `app/styles/**`：窗口样式与全局样式。
- `app/windows/shared/**`：跨窗口可复用组件。

## 当前阶段窗口编号（本项目）
- Window 1：登录
- Window 2：宏观可视化
- Window 3：数据库
- Window 4：交互对话

## 开发规则
1. 新功能必须先确定“主责模块”，禁止跨窗口随意散写逻辑。
2. 组件层不直接承担复杂后端聚合逻辑；后端通信统一走 `app/api/**` 或服务层。
3. 若同一逻辑被两个及以上窗口使用，必须抽到 `shared` 或 `lib`，不得复制粘贴。
4. 改动后需补充扩展性审查：
   - 是否易于增加新窗口/新节点/新模型；
   - 是否出现状态双源与职责重叠；
   - 是否引入高耦合路径依赖。

## 强制同步
涉及模块职责变化时，更新：
- `docs/architecture/modules-index.md`
- `docs/architecture/extension-review-checklist.md`
