# 模块职责总索引（modules-index）

> 目的：让任何人能快速知道“每个功能由哪些文件负责”。

## 1. 联邦问答后端（Python）

### 1.1 中心聚合服务
- 主责文件：`central_server.py`
- 职责：接收问题、加密转发、并发聚合节点结果、返回最终答案与节点明细；透传 `request-id`，提供 `GET /health` 节点健康聚合；执行联邦内部令牌校验（`x-federation-token`）与节点 URL TLS 策略校验。

### 1.2 节点检索服务
- 主责文件：`node_server.py`
- 职责：解密查询、执行单节点检索、加密返回候选答案；按请求头记录 `request-id`，通过环境变量加载 SM4 密钥；对 `/query` 与 `/health` 执行联邦内部令牌校验。

## 2. 前端 Window 4（交互对话）

- 主容器：`apps/main-platform/app/windows/main/MainWindow.tsx`
- 对话交互：`apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - 视觉状态机：`chatVisualState`（`empty_centered` / `active_bottom`）+ 中枢调度 `applyChatVisualState`；取代旧 `showSemicircle`
  - 五路触发点统一经 `applyChatVisualState`：首次发送 / 新建对话 / 加载历史 / 删除对话 / 模式切换
  - 历史加载采用请求令牌（`loadConvTokenRef`）+ `historyLoadingConvId` Pending-UI，不提前触发动画
- 历史记录组：`apps/main-platform/app/windows/main/components/ChatHistoryGroup.tsx`
  - 新增 `loadingConvId` prop：在正在加载的条目上显示 Pending 指示器
- 溯源窗口：`apps/main-platform/app/windows/main/components/TraceWindow.tsx`
- 知识图谱：`apps/main-platform/app/windows/main/components/TraceKnowledgeGraph.tsx`
- 画布/装饰：
  - `apps/main-platform/app/windows/main/components/ChatCanvasLines.tsx`
  - `apps/main-platform/app/windows/main/components/ModelConfigCanvasLines.tsx`
  - `apps/main-platform/app/windows/main/components/DotGrid.tsx`

## 3. 前端 Window 3（数据库）

- 主容器：`apps/main-platform/app/windows/database/DatabaseWindow.tsx`
- 聚类详情：`apps/main-platform/app/windows/database/components/ClusterDetailWindow.tsx`
- 文件预览：`apps/main-platform/app/windows/database/components/FilePreviewModal.tsx`

## 4. 前端 Window 2（宏观可视化）

- 主容器：`apps/main-platform/app/windows/macro/MacroWindow.tsx`
- D1 时间线：`apps/main-platform/app/windows/macro/components/D1Timeline.tsx`
- D2 视图：`apps/main-platform/app/windows/macro/components/D2Visualization.tsx`
- D3 沙盘：`apps/main-platform/app/windows/macro/components/D3SandboxThreeMvp.tsx`
- D4 曲线：`apps/main-platform/app/windows/macro/components/D4Visualization.tsx`
- D5 词云：`apps/main-platform/app/windows/macro/components/D5WordCloud.tsx`

## 5. 前端 Window 1（登录）

- 介绍窗口：`apps/main-platform/app/windows/login/LoginIntroWindow.tsx`
- 登录表单：`apps/main-platform/app/windows/login/LoginForm.tsx`（账号字段 + 前端校验 + admin mock）
- 登录工具：`apps/main-platform/app/windows/login/utils.ts`

## 6. 跨窗口共享能力

- 顶部导航：`apps/main-platform/app/windows/shared/GlobalTopNav.tsx`（含管理员胶囊按钮 + 红点）
- 个人信息弹层：`apps/main-platform/app/windows/shared/ProfileModalLong.tsx`
- **管理员操作面板**：`apps/main-platform/app/windows/shared/AdminModal.tsx`（三段列表：用户信息 / 申请审批 / 历史记录）
- 共享动画工具：`apps/main-platform/app/windows/shared/animation.ts`
- 共享坐标工具：`apps/main-platform/app/windows/shared/coords.ts`
  - 新增 `svgToCssPx`：将 SVG viewBox 坐标换算为 CSS 像素位置（处理 xMidYMid slice）
  - 新增 `svgShiftPx`：计算画布状态切换时 HTML 层的 CSS 像素位移（替代 -15vw 等魔法值）

## 7. Next.js API（BFF / 内部接口）

### 7.1 数据库相关接口
- `apps/main-platform/app/api/database/clusters/route.ts`
- `apps/main-platform/app/api/database/clusters/[clusterId]/route.ts`
- `apps/main-platform/app/api/database/clusters/[clusterId]/files/route.ts`
- `apps/main-platform/app/api/database/clusters/[clusterId]/files/[fileId]/route.ts`
- `apps/main-platform/app/api/database/clusters/restore/route.ts`
- `apps/main-platform/app/api/database/metrics/route.ts`
- `apps/main-platform/app/api/database/updates/route.ts`

### 7.2 模型配置相关接口
- `apps/main-platform/app/api/model-config/connect/route.ts`

### 7.3 联邦聊天 BFF 接口
- `apps/main-platform/app/api/federation/ask/route.ts`
- `apps/main-platform/app/api/federation/health/route.ts`
- `apps/main-platform/app/lib/server/federation/security.ts`

### 7.4 聊天历史接口（Prisma + PostgreSQL）
- `apps/main-platform/app/api/chat-history/route.ts`
- `apps/main-platform/app/api/chat-history/[conversationId]/route.ts`
- `apps/main-platform/app/api/chat-history/[conversationId]/messages/route.ts`

### 7.5 节点检索与节点治理接口
- `apps/main-platform/app/api/node/retrieve/route.ts`
- `apps/main-platform/app/api/node/health/route.ts`
- `apps/main-platform/app/api/node/admin-action/route.ts`

### 7.6 节点鉴权边界（Phase 4 前置）
- `apps/main-platform/app/api/_shared/node-auth.ts`
- `apps/main-platform/app/lib/node-auth-contract.ts`

## 9. 管理员模式前端接口适配层（双通道：真实后端优先 / mock 回退）

- 认证适配器：`apps/main-platform/app/lib/client/auth-adapter.ts`
  - 职责：封装 login / register 调用；`NEXT_PUBLIC_MIA_RAG_AUTH_URL` 设置时调用真实后端 `POST /api/auth/login|register`，未设置时回退 mock（admin/311311）；成功登录后 JWT 写入 `localStorage["mia_rag_token"]`；调用方无感知切换。
- 管理员数据适配器：`apps/main-platform/app/lib/client/admin-adapter.ts`
  - 职责：封装 listUsers / listRequests / listHistory / approveRequest / submitRequest；同样 mock + 预留双通道。
  - 协同调用：`apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx` 在“保存并连接”时提交“配置法官模型”申请，备注为用户输入的法官模型 URL。

## 10. 管理员状态中枢

- 主责文件：`apps/main-platform/app/components/runtime/AppRuntimeProvider.tsx`
  - 新增 `isAdmin: boolean`（session-only，不持久化）与 `setIsAdmin`。
  - 登录成功时由 `login-window-demo.tsx` 写入；退出时重置。

## 11. Prisma 数据模型（管理员）

- 主责文件：`apps/main-platform/prisma/schema.prisma`
  - 新增 `User`、`AdminActionRequest`、`AdminActionHistory` 模型与相关 enum（`UserRole/UserStatus/NodeType/RequestType/RequestStatus`）。
  - 密码字段仅存哈希（`passwordHash`），严禁明文。
  - 高频查询索引：`status + createdAt`、`applicantId + createdAt`。

## 8. 联邦服务层与前端调用封装

### 8.1 服务层（Server）
- 主责目录：`apps/main-platform/app/lib/server/federation/`
- 主责文件：
  - `apps/main-platform/app/lib/server/federation/central-client.ts`（中心服务调用、超时控制、响应归一化）
  - `apps/main-platform/app/lib/server/federation/schemas.ts`（联邦接口 schema/类型）
  - `apps/main-platform/app/lib/server/federation/errors.ts`（错误归一化）
  - `apps/main-platform/app/lib/server/federation/security.ts`（联邦 URL/TLS 规范化、内部鉴权令牌头构造）

### 8.2 Window 4 前端调用
- 主责文件：
  - `apps/main-platform/app/windows/main/services/federation-chat-api.ts`
  - `apps/main-platform/app/windows/main/services/node-retrieve-api.ts`
- 协同文件：
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `apps/main-platform/app/api/node/retrieve/route.ts`
- 职责：`global` 模式调用 `/api/federation/ask`，`local` 模式调用 `/api/node/retrieve`，统一请求 ID、错误归一化与节点身份头。

### 8.4 前端节点身份头适配层
- 主责文件：`apps/main-platform/app/lib/client/node-auth-headers.ts`
- 协同文件：
  - `apps/main-platform/app/windows/database/DatabaseWindow.tsx`
  - `apps/main-platform/app/windows/database/components/ClusterDetailWindow.tsx`
  - `apps/main-platform/app/windows/macro/components/D1Timeline.tsx`
  - `apps/main-platform/app/windows/macro/components/D3SandboxThreeMvp.tsx`
- 职责：将运行时 `account + role(central/normal)` 收敛为统一请求头，避免各窗口散写认证字段。

### 8.3 聊天历史服务层与数据模型
- 主责文件：
  - `apps/main-platform/app/lib/server/chat-history/index.ts`（存储模式路由、Prisma 调用、Mock 降级；`CHAT_HISTORY_STORAGE_MODE` 开关）
  - `apps/main-platform/app/lib/server/chat-history/mock-storage.ts`（服务端纯内存 Mock；无 localStorage 依赖）
  - `apps/main-platform/prisma/schema.prisma`
  - `apps/main-platform/app/lib/server/prisma.ts`
- 协同文件：
  - `apps/main-platform/app/lib/chat-history-contract.ts`
  - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
  - `apps/main-platform/.env.example`（含 `CHAT_HISTORY_STORAGE_MODE` 注释）
- 职责：会话/消息持久化、标题规则统一（首条用户消息自动更新标题）、local/global 分组查询、会话消息追加（事务写入+标题联动）、物理删除；存储模式三档切换（prisma 默认 / auto / mock）。

## 12. MiA-RAG 后端集成层

### 12.1 新 node_server.py（真实 MiA-RAG 节点）
- 主责文件：`Encrypted-Smart-Graph-Federated-Knowledge-Graph-Collaborative-Retrieval-Engine-main/node_server.py`
- 职责：完整 MiA-RAG 引擎节点；SM4 加密联邦端点 `POST /query`、`GET /health`（内部令牌保护）；同时挂载 `api/routers/*` REST API（直连 Swagger 访问）。
- 协同文件：`Encrypted-Smart-Graph-Federated-Knowledge-Graph-Collaborative-Retrieval-Engine-main/api/routers/query.py`

### 12.2 内部 BFF 查询端点
- 主责文件：`Encrypted-Smart-Graph-Federated-Knowledge-Graph-Collaborative-Retrieval-Engine-main/api/routers/query.py`
- 职责：新增 `POST /api/query/internal`，接受 `X-Federation-Token` 鉴权（无需用户 JWT），供 Next.js BFF `node/retrieve` 本地模式调用；返回 `{ requestId, status, answer, details }` 契约。

### 12.3 本地检索 BFF 桥接
- 主责文件：`apps/main-platform/app/api/node/retrieve/route.ts`
- 职责：本地模式（`MIA_RAG_NODE_URL` 已配置）优先调用 `POST {MIA_RAG_NODE_URL}/api/query/internal`，12s 超时；失败或未配置时回退 SQL 关键词检索；映射 MiA-RAG evidence → `NodeRetrieveDetail` 契约。

### 12.4 后端环境模板
- 主责文件：`backend.env.example`
- 协同文件：`apps/main-platform/.env.example`（新增 `MIA_RAG_NODE_URL`、`NEXT_PUBLIC_MIA_RAG_AUTH_URL` 注释段）

---

## 维护规则

1. 新增功能时，必须在本文件追加“主责文件 + 协同文件”。
2. 若模块重命名或职责迁移，必须同步改本索引。
3. 任何“找不到功能归属文件”的改动，视为不合规改动。
