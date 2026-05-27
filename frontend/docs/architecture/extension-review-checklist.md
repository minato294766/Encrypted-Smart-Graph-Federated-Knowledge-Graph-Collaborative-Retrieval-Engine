# 扩展性审查清单（extension-review-checklist）

> 用途：每次新增功能或改动行为后，进行“可扩展性与结构稳定性”审查。
> 说明：本清单不是报错检查，而是架构与长期维护检查。

## A. 必填元数据

- 功能名称：
- 需求来源：
- 变更日期：
- 主责文件：
- 协同文件：
- 是否更新 `modules-index.md`：是 / 否

## B. 变更边界

1. 本次功能属于哪个模块？边界是否清晰？
2. 是否跨窗口/跨服务修改？若是，边界如何隔离？
3. 是否引入新状态源？single source of truth 是否明确？

## C. 扩展性审查（必须逐项回答）

1. 新增第 N 个节点时，这套实现是否仍可复用？
2. 新增第 N 种模式（本地/全局/混合）时，是否会导致分支爆炸？
3. 新增字段是否向后兼容（默认值/可选策略）？
4. 是否存在硬编码扩散（常量散落、路径写死、文案写死）？
5. 是否存在重复逻辑，可否当次抽象？
6. 是否有潜在性能风险（全量重算、重复请求、无缓存、阻塞渲染）？
7. 失败与超时路径是否有明确降级与用户反馈？
8. 接口错误是否已做归一化处理（状态码 + 错误结构）？

## D. 必要重构记录

- 本次识别出的结构问题：
- 已实施的重构动作：
- 未处理项（必须说明原因与风险，不允许留空）：

## E. 审查结论

- 结论：通过 / 不通过
- 不通过原因：
- 下一步整改：
- 审查人（AI/人工）：

---

## 审查记录（追加区）

### [模板] YYYY-MM-DD - 功能名
- 主责文件：
- 协同文件：
- 关键扩展性结论：
- 重构动作：
- 风险与后续：

### 2026-04-28 - Window 4 global 联邦聊天链路正式接入
- 主责文件：
  - `apps/main-platform/app/api/federation/ask/route.ts`
  - `apps/main-platform/app/lib/server/federation/central-client.ts`
  - `apps/main-platform/app/windows/main/services/federation-chat-api.ts`
- 协同文件：
  - `apps/main-platform/app/api/federation/health/route.ts`
  - `apps/main-platform/app/lib/server/federation/schemas.ts`
  - `apps/main-platform/app/lib/server/federation/errors.ts`
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `central_server.py`
  - `node_server.py`
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - `local/global` 双模式边界保持清晰：仅 `global` 走联邦链路，`local` 保持本地 mock。
  - BFF/服务层/组件分层明确，避免 UI 承担聚合逻辑，后续新增节点或替换中心服务时改动集中在服务层。
  - 错误结构统一为 `code/message/requestId/details`，并在前端保留可解释错误文案，减少分支爆炸。
  - 健康检查新增聚合入口 `/api/federation/health`，支持后续接入更多节点健康探针。
- 重构动作：
  - 抽离重复接口契约到 `schemas.ts`，避免 ask 路由与 client 重复定义。
  - 抽离错误归一化到 `errors.ts`，避免 BFF 各路由重复拼装错误结构。
  - 将联邦调用从组件内联 `fetch` 收敛到 `services/federation-chat-api.ts`，避免组件边界污染。
  - 清理 Python 侧 SM4 硬编码，统一改为环境变量读取。
- 风险与后续：
  - 当前 `local` 仍为 mock 策略，若后续要接真实本地检索需新增独立服务契约，避免与 `global` 链路耦合。

### 2026-05-10 - Window 4 画布竖线统一右移 +100（历史记录栏扩展预备）
- 主责文件：
  - `apps/main-platform/app/windows/shared/coords.ts`（新增 `CANVAS_X_SHIFT=100`，应用于 MAIN_CANVAS/MC_CANVAS 全部三态 x1/x2）
  - `apps/main-platform/app/styles/window-3-main.css`（CSS 变量 fallback 更新为 32%/18%；`.mc-panel-layer` 从 `inset:0` 改为 `--w4-canvas-left/right` 约束，修正模型配置面板内容未跟随右移的结构性问题）
- 协同文件：
  - `apps/main-platform/app/windows/main/components/ChatCanvasLines.tsx`（消费坐标常量，无需改动）
  - `apps/main-platform/app/windows/main/components/ModelConfigCanvasLines.tsx`（消费坐标常量，无需改动）
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`（`svgToCssPx`/`svgShiftPx` 自动推导，无需改动）
- 关键扩展性结论：
  - `CANVAS_X_SHIFT` 作为统一右移 token，后续再次调整只改一个常量，六组坐标状态与 HTML 覆盖层自动同步。
  - 修正了 `.mc-panel-layer` 原始设计缺陷：以 `inset:0` 独立于坐标系统定位，导致坐标变化时模型配置内容不跟随。改为与 `.chat-interaction-panel` 同样的 `--w4-canvas-left/right` 约束，使两层画布内容完全一致地响应坐标偏移。
  - GSAP 菜单位移 `svgShiftPx(EXPANDED → MENU_OPEN)` 计算逻辑保持不变，因为两个常量均已应用 `CANVAS_X_SHIFT`，差值结论不变。
- 重构动作：
  - `.mc-panel-layer` 定位机制纳入坐标驱动体系，消除与信息流层的结构性分叉。
- 风险与后续：
  - CSS 变量 fallback（32%/18%）为 SSR 安全兜底，JS 初始化后立即由 ResizeObserver 精确值覆盖，无视觉跳变。
  - 历史记录栏接入时只需调整 `CANVAS_X_SHIFT`（或直接修改各状态坐标），两层画布及其内容均自动跟随，不需要再次散改 CSS。
  - 需在部署环境补齐 `FEDERATION_SM4_KEY`、`FEDERATION_CENTRAL_BASE_URL` 等变量，否则服务会快速失败并返回配置错误。
  - 建议后续补充联邦链路限流/鉴权（当前重点为链路打通与错误可观测性）。

### 2026-05-10 - Window 4 实时坐标驱动布局重构（预备历史记录栏扩展底座）
- 主责文件：
  - `apps/main-platform/app/windows/shared/coords.ts`（新增 `svgToCssPx`、`svgShiftPx` 纯函数）
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`（新增 layerRef + ResizeObserver + CSS 变量写入，替换 -15vw 魔法值）
  - `apps/main-platform/app/styles/window-3-main.css`（`.chat-interaction-panel` left/right 改 CSS 变量，`.mc-canvas-close-anchor` right 改 CSS 变量）
- 协同文件：
  - `apps/main-platform/app/windows/main/components/ChatCanvasLines.tsx`（共享同一 coords 常量，无需改动）
  - `apps/main-platform/app/windows/main/components/ModelConfigCanvasLines.tsx`（共享同一 coords 常量，无需改动）
- 关键扩展性结论：
  - `svgToCssPx`/`svgShiftPx` 为纯函数，坐标来源唯一（`coords.ts`），后续修改 `MAIN_CANVAS_EXPANDED` 等常量可自动传播到 HTML 层。
  - CSS 变量以 `--w4-canvas-*` 命名前缀隔离，不污染其他窗口，新增历史记录栏只需更改坐标常量即可驱动位置。
  - `preserveAspectRatio="xMidYMid slice"` 映射已统一到 `svgToCssPx`，支持任意缩放级别（已对 125% 缩放验证数学等价性）。
  - 菜单联动 GSAP 位移改为 `svgShiftPx` 计算，消除 `-15vw` 硬编码，后续平移量可直接通过修改坐标常量自动推导。
- 重构动作：
  - 将 SVG→CSS 坐标换算逻辑收归到 `shared/coords.ts`，避免各消费方重复实现。
  - CSS 变量 fallback 保留为 `25%`，确保 SSR 首帧无视觉跳变。
  - 小屏响应式断点保留原始 `left: 8%; right: 8%` 覆盖，不影响窄屏行为。
- 风险与后续：
  - `menuOpen` 当前在 `MainWindow.tsx` 中始终为 `false`（菜单功能未开放），坐标驱动位移逻辑已就绪但暂未实际触发，待菜单开放时需端到端回归验收。
  - 历史记录栏接入时，只需修改 `MAIN_CANVAS_EXPANDED.x1/x2` 等坐标常量，HTML 层定位将自动跟随，不需要再次散改 CSS 百分比。

### 2026-05-10 - Window 4 聊天历史（Prisma + PostgreSQL）
- 主责文件：
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `apps/main-platform/app/lib/server/chat-history/index.ts`
  - `apps/main-platform/app/api/chat-history/route.ts`
  - `apps/main-platform/app/api/chat-history/[conversationId]/route.ts`
  - `apps/main-platform/app/api/chat-history/[conversationId]/messages/route.ts`
  - `apps/main-platform/prisma/schema.prisma`
- 协同文件：
  - `apps/main-platform/app/lib/chat-history-contract.ts`
  - `apps/main-platform/app/lib/server/prisma.ts`
  - `apps/main-platform/app/styles/window-3-main.css`
  - `apps/main-platform/.env.example`
  - `apps/main-platform/package.json`
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - 对话数据 single source of truth 下沉到 Prisma 会话表 + 消息表，前端只保留当前会话渲染状态，避免状态双源。
  - local/global 分组通过 `mode` 字段统一，后续新增模式可沿 `mode` 扩展而无需重写消息结构。
  - Route Handler 仅处理校验/编排，复杂规则（标题生成、追加消息、删除）收敛到 `lib/server/chat-history`，可维护性更高。
  - 左侧历史栏锚定 SVG 扩展画布变量（`--w4-sidebar-left`），避免魔法值扩散，后续坐标调整可自动跟随。
  - 删除流程采用统一确认弹窗语义（复用数据库窗口样式），物理删除路径明确，行为可审计。
- 重构动作：
  - 将会话标题截断与空会话过滤策略集中到服务层，避免 UI 端重复判断。
  - 将“发送消息→会话创建/追加”统一为 `persistTurn` 路径，减少分叉逻辑。
  - 将“切模式/新建对话”统一先保存后清空，保持行为一致。
- 风险与后续：
  - 需先执行 `prisma generate` 与数据库迁移后再进行联调。
  - 当前接口尚未接入鉴权/限流；若部署到多用户环境需补齐访问控制。
  - 建议补充 API 级集成测试（创建、追加、切模式保存、删除）验证回归。

### 2026-05-10 - Window 4 历史会话可靠性修复（空会话创建 + 错误可观测）
- 主责文件：
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `apps/main-platform/app/api/chat-history/route.ts`
  - `apps/main-platform/app/lib/server/chat-history/index.ts`
- 协同文件：
  - `apps/main-platform/app/api/chat-history/[conversationId]/route.ts`
  - `apps/main-platform/app/api/chat-history/[conversationId]/messages/route.ts`
  - `apps/main-platform/app/api/chat-history/error-response.ts`
  - `apps/main-platform/app/lib/chat-history-contract.ts`
  - `apps/main-platform/app/styles/window-3-main.css`
- 关键扩展性结论：
  - “新建对话”改为显式创建空会话占位，避免依赖“先发消息再落库”的隐式行为，历史栏状态更可预测。
  - 前端历史接口统一收敛到 `requestChatHistoryJson`，`fetch` 非 2xx 与 JSON 解析失败路径可观测，减少静默失败。
  - API 错误语义统一收敛到 `error-response.ts`，按数据库初始化失败/记录不存在/关系失败分级返回状态码，便于后续监控与排障。
  - 会话创建契约扩展为支持 `messages=[]`，向后兼容原有“带消息创建”路径，后续可平滑引入草稿会话能力。
- 重构动作：
  - 删除历史相关 `fetch + !ok return + catch noop` 分散写法，统一抽象请求与错误消息提取。
  - 抽离路由错误归一化工具，消除三个 route handler 的重复 catch 逻辑。
  - 服务层补充默认标题与空消息分支，避免 UI 层硬编码标题策略扩散。
- 风险与后续：
  - 当前“新建会话”会立即产生空会话记录，若用户高频点按可能增加空会话数量，后续可考虑空会话回收策略（如 24h 无消息自动清理）。
  - 多用户场景仍需补鉴权与租户隔离，否则会话列表边界不足。

### 2026-05-14 - Window 4 聊天历史二阶段重构（存储模式开关 + 交互稳定性）
- 主责文件：
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `apps/main-platform/app/lib/server/chat-history/index.ts`
  - `apps/main-platform/app/lib/server/chat-history/mock-storage.ts`
- 协同文件：
  - `apps/main-platform/.env.example`
  - `apps/main-platform/app/windows/main/components/AGENTS.md`
  - `docs/architecture/modules-index.md`
  - `docs/architecture/extension-review-checklist.md`
- 关键扩展性结论：
  - 聊天历史存储策略从“隐式自动降级”升级为显式三档：`auto / mock / prisma`，避免环境差异导致的行为不可预期。
  - 服务端 Mock 存储移除 `localStorage` 依赖，职责边界清晰为“Node 进程内存回退层”，与浏览器持久化语义解耦。
  - 历史栏动画改为“更新前捕获 + 更新后执行”的稳定时序，消除旧实现中 `before/after` 同帧导致的位移动画失效。
  - 删除确认弹窗改为 Portal 到 `document.body`，脱离 `chat-interaction-layer` 堆叠上下文，避免被全局导航层遮挡并导致按钮不可点击。
  - 会话加载与追加路径对 `Conversation not found` 增加恢复机制（刷新列表或降级新建），降低陈旧会话 ID 引发的死路状态。
- 重构动作：
  - 抽离并前置 `captureFlipState()`，统一历史列表的 Flip 状态捕获入口。
  - `persistTurn` 改为“追加失败可降级新建”的单路径恢复策略，避免错误后静默中断。
  - 目录下新增组件级 `AGENTS.md`，固化 Window 4 组件职责与交互约束，减少后续回归风险。
- 风险与后续：
  - `mock` 模式仍为进程内临时存储，服务重启后数据会清空；该行为为预期，但需要联调环境明确模式配置。
  - 目前 `Conversation not found` 识别基于错误文案字符串；后续建议统一为结构化错误码（如 `CHAT_HISTORY_NOT_FOUND`）以减少文案耦合。
  - 建议补充 E2E 回归：新建/加载/删除/切模式 + 服务重启后续发消息路径。

### 2026-05-21 - 管理员模式前端框架（LoginForm + AppRuntimeProvider + GlobalTopNav + AdminModal + Prisma schema）
- 主责文件：
  - `apps/main-platform/app/windows/login/LoginForm.tsx`（账号字段替换、前端校验、auth-adapter 调用）
  - `apps/main-platform/app/components/runtime/AppRuntimeProvider.tsx`（新增 `isAdmin` session 状态 + `setIsAdmin`）
  - `apps/main-platform/app/windows/shared/GlobalTopNav.tsx`（管理员胶囊按钮、红点、AdminModal 挂载）
  - `apps/main-platform/app/windows/shared/AdminModal.tsx`（三段可滚动列表，复用 ProfileModalLong 同壳）
  - `apps/main-platform/app/lib/client/auth-adapter.ts`（认证接口适配层）
  - `apps/main-platform/app/lib/client/admin-adapter.ts`（管理员数据适配层）
  - `apps/main-platform/prisma/schema.prisma`（User / AdminActionRequest / AdminActionHistory + 相关 enum）
- 协同文件：
  - `apps/main-platform/app/windows/login/LoginIntroWindow.tsx`（onSignIn 签名更新）
  - `apps/main-platform/app/login-window-demo.tsx`（handleSignIn 写入 isAdmin + 退出时重置）
  - `apps/main-platform/app/styles/global-top-nav.css`（管理员按钮/红点/三段列表样式）
  - `apps/main-platform/app/styles/window-1-login.css`（表单错误/申请中提示样式）
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - `isAdmin` 为 session-only（不持久化到 localStorage），安全边界明确；后端接入后状态来源不变，只改 `auth-adapter` 返回值。
  - 接口适配层（`auth-adapter / admin-adapter`）隔离了 mock 与真实后端，视图层零感知切换；新增接口类型只在适配层扩展，不改 UI。
  - `AdminModal` 三段列表参数化为共享行组件（`UserRow / RequestRow / HistoryRow`），避免三套重复 JSX；后续新增列只需改行组件与 grid-template-columns。
  - 申请类型通过 `RequestType` enum 管理，新增类型只扩展 enum，主流程不变。
  - 红点与申请数量通过 `onPendingCountChange` 回调联动，状态单向流动，无双源。
  - AdminModal 复用 `global-top-nav__profile-modal--long` 外壳，保证同尺寸同风格，差异通过 `admin-modal` 附加类隔离。
- 重构动作：
  - 将管理员态收归 `AppRuntimeProvider`，禁止登录页 / 导航页双源状态。
  - 将管理员数据访问统一到 `admin-adapter`，禁止组件直接散写 `fetch`。
  - 三段列表行结构已参数化为独立组件，无重复渲染逻辑。
- 风险与后续：
  - 真实后端接入时，只需在 `auth-adapter.ts` 和 `admin-adapter.ts` 的 TODO 注释处替换 fetch 逻辑，视图层无需改动。
  - Prisma schema 已添加但尚未执行 `prisma migrate dev`；接入后端时需由项目成员执行迁移命令。
  - 当前 mock 中管理员账号 `admin/311311` 为前端硬编码；后端接入后此块应完整移除，避免敏感信息残留。
  - AdminModal 的 `pendingCount` 初始值为 0，首次打开弹层后由 `onPendingCountChange` 回填；如需在导航栏常驻红点需补充轮询或 SSE 推送。

### 2026-05-14 - Window 4 聊天历史三阶段修复（强制 Prisma + 标题自动更新 + 加载失败不清空列表）
- 主责文件：
  - `apps/main-platform/app/lib/server/chat-history/index.ts`
  - `apps/main-platform/app/lib/server/chat-history/mock-storage.ts`
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
- 协同文件：
  - `apps/main-platform/.env.example`
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - 默认存储策略由 `auto`（静默降级 mock）改为 `prisma`（显式报错），消除数据持久化的不确定性；前端开发测试可通过 `CHAT_HISTORY_STORAGE_MODE=mock` 独立于数据库运行。
  - `appendMessages` 改为 Prisma 事务：`createMany` + 条件 `findUnique` + `update(title/updatedAt)` 原子执行，确保标题更新与消息写入同步，不产生中间态脏数据。
  - `handleLoadConversation` 错误处理策略：从"全量刷新列表"改为"仅移除失效单条"，彻底隔离单条会话不存在与整体列表可用性，符合主流 AI 产品行为。
  - Mock 存储追加同步加入标题自动更新逻辑，保持与 Prisma 路径的行为一致性，离线演示模式不再出现标题一直是"新建对话"的问题。
- 重构动作：
  - 服务层 `appendMessages` 从简单 update 升级为事务块，复杂度集中于服务层，route handler 无需修改。
  - `handleLoadConversation` 移除对 `fetchConversations` 的依赖（错误路径），依赖数组精简，行为更可预测。
- 风险与后续：
  - `prisma` 模式下，若数据库未启动，`listAllConversations` 会返回 503；前端已有错误提示，不会白屏。
  - 标题更新依赖 `DEFAULT_CONVERSATION_TITLE === "新建对话"` 字符串匹配；若多语言需求出现，需改为 DB 字段 `is_title_auto` 标记。
  - 建议验收路径：新建对话 → 首条消息发送 → 刷新页面 → 侧栏标题已更新；点击任意侧栏条目 → 不清空其他条目。

### 2026-05-21 - 模型配置提交触发管理员申请（法官模型 URL 备注）
- 主责文件：
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
- 协同文件：
  - `apps/main-platform/app/lib/client/admin-adapter.ts`
  - `apps/main-platform/app/components/runtime/AppRuntimeProvider.tsx`
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - “保存并连接”入口新增前置钩子：仅当法官模型（非 Local）通过 URL/Key 校验时，提交管理员申请，避免无效/空配置污染审批列表。
  - 申请备注直接复用用户输入的 `judge.baseUrl`，不引入额外字段，保持现有 `AdminRequest.remark` 契约稳定。
  - 申请账号来源统一读取运行时状态 `username`（single source of truth），避免 Window 4 自建用户状态。
  - 管理员申请提交失败不阻断模型连接流程，保证核心交互可用；失败影响范围局限在审批链路。
- 重构动作：
  - 将“配置法官模型申请提交”收敛到 `handleMCConnect` 单入口，避免在多个按钮或分支散写同类提交逻辑。
- 风险与后续：
  - 当前防重策略为“每次点击保存并连接都会产生一条申请”；后续若需去重，可在后端按 `account + requestType + remark + status=PENDING` 建唯一约束或幂等键。
  - 当前仅对非 Local 法官模型提交 URL 申请；若后续 Local 模式也需审批，建议扩展为提交 `localUrl/modelPath` 的结构化备注。

### 2026-05-23 - Window 4 local 模式切换至节点检索 API + account 边界收紧
- 主责文件：
  - `apps/main-platform/app/windows/main/services/node-retrieve-api.ts`
  - `apps/main-platform/app/api/node/retrieve/route.ts`
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
- 协同文件：
  - `apps/main-platform/app/lib/node-retrieve-contract.ts`
  - `apps/main-platform/app/lib/server/node-data/index.ts`
  - `apps/main-platform/app/api/node/admin-action/route.ts`
  - `apps/main-platform/app/api/database/clusters/route.ts`
  - `apps/main-platform/app/api/database/clusters/[clusterId]/route.ts`
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - Window 4 模式路由边界从“global=联邦、local=mock”升级为“global=联邦、local=节点 API”，后续新增 `hybrid` 模式可继续沿服务层扩展，避免组件层分支膨胀。
  - 节点检索契约抽离到 `node-retrieve-contract.ts`，前端服务、Route Handler、服务层共享字段定义，降低字段漂移风险。
  - create/delete cluster 与 node retrieve/admin-action 请求统一要求显式 `account`，减少隐式 fallback 带来的跨账号边界污染风险。
- 重构动作：
  - 移除 `ChatInteractionPanel` 中 local mock 回复主链路，改由 `node-retrieve-api` 统一封装请求 ID、响应校验、错误归一化。
  - `retrieveNodeAnswer` 返回类型改为复用共享 contract（去重本地接口定义），减少服务层重复声明。
- 风险与后续：
  - 目前“deny-by-default”仍停留在参数边界层；若需达到计划中的安全阶段目标，仍需补充真实鉴权/授权与限流中间件。
  - local 模式切到节点检索后，若 `DATABASE_URL` 不可用会返回结构化错误文案；建议后续补充“节点不可用时的引导恢复提示”。

### 2026-05-24 - Window 4 对话初始态重构（空态居中输入框 + 双向 GSAP 动画 + 删除旋转圆弧）
- 主责文件：
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `apps/main-platform/app/styles/window-3-main.css`
- 协同文件：
  - `apps/main-platform/app/windows/main/components/ChatHistoryGroup.tsx`（新增 `loadingConvId` prop）
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - 旧 `showSemicircle` boolean 升级为 `chatVisualState: 'empty_centered' | 'active_bottom'`，状态语义清晰，后续若新增第三态（如 `loading`）只需扩展联合类型与调度分支，不改现有路径。
  - 五路触发点（首次发送、新建对话、加载历史、删除对话、模式切换）全部收敛到 `applyChatVisualState` 单一调度函数，消除原有散落 `setShowSemicircle` 导致的行为不一致风险。
  - 历史加载采用"请求令牌 + Pending-UI"模式，数据返回后才触发动画，避免提前触发时序与实际数据不匹配。
  - GSAP 动画属性仅操作 `transform(y/x)` + `width` + `opacity`，未引入 `filter` 高频重绘属性，符合全局 GSAP 质量基线。
  - `canvasReady` 初始展示动画拆分为 empty/active 双路径，避免 SSR 后首帧闪烁。
- 重构动作：
  - 完全移除 `.chat-semicircle-overlay` / `.semicircle` / `@keyframes rotate141` CSS 及对应 JSX + 状态逻辑。
  - `inputAreaRef`（y 轴定位）与 `inputInnerRef`（宽度/水平居中）职责分离，避免单元素承载多维度动画的混叠问题。
  - `handleDeleteConversation` 新增 `applyChatVisualState` 至依赖数组，修复原来遗漏触发点导致的视觉态残留。
- 风险与后续：
  - `applyChatVisualState` 使用 `offsetHeight`/`offsetWidth` 同步读取布局，若在隐藏容器内被调用会返回 0（目前不会发生，所有调用时机元素均已挂载且可见）。
  - 宽度动画暂用像素值，窗口 resize 时不会重新计算；后续若需响应 resize，可在 ResizeObserver 中重新 `applyChatVisualState(chatVisualStateRef.current, true)`。
  - `chatVisualState` React state 仅用于 `data-chat-state` 属性暴露，实际逻辑驱动由 ref 承担，两者可能短暂不同步（动画进行中）；这是预期行为，不影响渲染正确性。

### 2026-05-24 - 前端渲染稳定性修复（GPU 合成层 + 动画负载 + 图片闪烁）
- 主责文件：
  - `apps/main-platform/app/styles/global-watermark.css`（去除 mix-blend-mode / transform:translateZ(0) / will-change:opacity）
  - `apps/main-platform/app/styles/window-3-main.css`（去除 .chat-bubble--bot 的 backdrop-filter；三重 drop-shadow 缩减为单个；chat-input-wrap blur 14→4）
  - `apps/main-platform/app/windows/main/components/DotGrid.tsx`（Path2D 缓存，避免每帧 new Path2D()）
  - `apps/main-platform/app/windows/shared/GlobalTopNav.tsx`（logo img 补充 width/height HTML 属性）
  - `apps/main-platform/app/styles/window-5-macro.css`（移除 .macro-svg-canvas / .macro-modules-layer 上的 will-change:transform）
- 协同文件：无跨模块改动；均为纯样式/渲染层修复
- 关键扩展性结论：
  - `mix-blend-mode` + `transform:translateZ(0)` 组合在存在 WebGL/Canvas RAF 循环的页面必须避免；后续任何全局遮罩层禁止同时使用两者。
  - 动态数量的 DOM 元素（如聊天气泡）不应携带 `backdrop-filter`；该属性的合法使用场景限于固定数量的容器（导航栏、输入框等）。
  - `will-change` 只应在 GSAP/CSS 动画主动触发前短暂添加，不应写入静态布局容器的长期样式。
  - HTML `<img>` 的 SVG 源文件必须同时附加 `width`/`height` HTML 属性，防止 CSS 加载前的自然尺寸渲染。
- 重构动作：
  - 去除跨全局窗口的 GPU 合成层触发因子（mix-blend-mode + translateZ 组合）。
  - 将高频 RAF 内的堆分配（Path2D per frame）改为缓存，降低 GC 对 RAF 节拍的干扰。
  - 缩减宏观平台层的无效 GPU 层晋升（两个静态定位容器的 will-change:transform）。
- 风险与后续：
  - 去除 mix-blend-mode 后水印文字在深色背景上对比度轻微提升；原 multiply 混合在白底下效果几乎相同，视觉差异可接受。
  - chat-bubble--bot 的 backdrop-filter 已改为背景透明度补偿（0.05→0.08），气泡视觉保持蓝调半透明风格，无结构性外观变化。
  - 若未来需要在固定气泡数量的场景（如≤3条）恢复 backdrop-filter，须先确认活跃合成层总数在 GPU 安全阈值内。
  - SVG 滤镜已从三重缩减为单重，仍保留蓝紫光晕视觉；若需恢复更强光晕，应通过 GSAP 按需施加而非持续 CSS 动画叠加。
  - Edge 125% 缩放场景为验收目标，已覆盖用户实际使用环境。

### 2026-05-24 - 分布式 SQL 联邦安全硬化（TLS + 内部令牌 + 默认拒绝）
- 主责文件：
  - `apps/main-platform/app/lib/server/federation/security.ts`
  - `apps/main-platform/app/lib/server/federation/central-client.ts`
  - `apps/main-platform/app/api/federation/health/route.ts`
  - `central_server.py`
  - `node_server.py`
- 协同文件：
  - `apps/main-platform/app/api/_shared/node-auth.ts`
  - `apps/main-platform/.env.example`
  - `docs/architecture/modules-index.md`
- 关键扩展性结论：
  - 联邦 URL 校验与 TLS 策略收敛到 `federation/security.ts`，后续新增中心/节点地址字段可复用同一规范化入口，避免散落校验。
  - BFF、中心服务、节点服务统一引入 `x-federation-token` 内部令牌语义，默认拒绝未授权调用，跨服务授权边界一致。
  - `federation/health` 接口补齐统一错误归一化，配置错误与链路错误都返回稳定结构，便于后续监控告警接入。
  - `node-auth` 严格模式旁路限制为“仅非生产 + 显式允许”，降低误配置导致的权限穿透风险。
- 重构动作：
  - 抽离 BFF 联邦传输安全工具，替代 `central-client` 与 `federation/health` 内重复 URL/头部逻辑。
  - Python 中心服务新增节点 URL 规范化与请求头构造器，清理重复 headers 拼接。
  - Node/Central 增加统一的内部鉴权函数，避免接口级重复校验逻辑扩散。
- 风险与后续：
  - 开启默认内部令牌后，联调环境必须补齐 `FEDERATION_INTERNAL_TOKEN`，否则 `/ask` 与 `/health` 会返回 401。
  - 当前 TLS 放行策略允许 `localhost/127.0.0.1` 走 HTTP 以兼容本地联调；上线环境建议将 `FEDERATION_ALLOW_HTTP_LOCALHOST=false` 并全量启用 HTTPS。
  - PostgreSQL `scram-sha-256` 仍依赖数据库实例层配置（`pg_hba.conf/password_encryption`），应用侧已完成链路与接口硬化但仍需部署侧落实 DB 参数。

### 2026-xx-xx - MiA-RAG 后端接入（Phase 2 联邦链路 + 本地检索 + 真实鉴权）

- 改动涉及文件：
  - `Encrypted-Smart-Graph.../node_server.py`（新增内部令牌鉴权，对齐 central_server.py）
  - `Encrypted-Smart-Graph.../api/routers/query.py`（新增 `POST /api/query/internal`，X-Federation-Token 鉴权）
  - `apps/main-platform/app/api/node/retrieve/route.ts`（MiA-RAG 优先 + SQL 回退）
  - `apps/main-platform/app/lib/client/auth-adapter.ts`（双通道：真实后端优先 / mock 回退）
  - `apps/main-platform/.env.example`（新增 `MIA_RAG_NODE_URL`、`NEXT_PUBLIC_MIA_RAG_AUTH_URL`）
  - `backend.env.example`（后端 Python 侧完整 env 模板，含模型路径占位符）
  - `docs/architecture/modules-index.md`（新增 §12 MiA-RAG 集成层）
- 关键扩展性结论：
  - `POST /api/query/internal` 复用 `FEDERATION_INTERNAL_TOKEN` 鉴权语义，无需新增鉴权机制；后续若需跨节点直连，只需增加节点 URL env 即可。
  - `node/retrieve` 采用"优先 MiA-RAG、失败回退 SQL"策略，本地演示（无 Python 后端）完全不受影响。
  - `auth-adapter.ts` 双通道设计：`NEXT_PUBLIC_MIA_RAG_AUTH_URL` 未设置时继续走 mock，前端演示零中断；设置后无需改动任何调用方。
  - JWT 写入 `localStorage["mia_rag_token"]`，后续需要时可从客户端读取用于直接调用后端其他端点。
- 重构动作：
  - 新 `node_server.py` 补齐 `FEDERATION_REQUIRE_INTERNAL_TOKEN` 启动时检查，与 `central_server.py` 和 mock `node_server.py` 保持一致。
  - `query.py` 新增独立的 `InternalQueryRequest/Response` Pydantic 模型，避免污染现有 `QueryRequest/QueryResponse` 契约。
- 风险与后续：
  - 模型路径（`MODEL_PATH`、`BASE_MODEL_PATH`）和 `DEEPSEEK_API_KEY` 仍为占位符，需队友提供后填入 `backend.env.example`。
  - `node_server.py` SM4 key 若未设置，节点将以 base64 透明模式运行（已有 warning log），联调前需确认所有节点共享同一 `FEDERATION_SM4_KEY`。
  - `localStorage["mia_rag_token"]` 无过期清理机制，建议后续在登出时显式 `removeItem`。
