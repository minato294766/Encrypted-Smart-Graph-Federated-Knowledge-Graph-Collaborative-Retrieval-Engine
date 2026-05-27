# 1. final 项目第二阶段 README（后端对接）

## 1.1 文档目的

本文件用于定义本项目第二阶段（后端联调阶段）的统一目标、接口边界、目录规范与实施顺序。

第二阶段开始后，所有“聊天回答生成”能力默认以多节点协同链路为主线推进。

---

## 1.2 项目主旨

本项目核心是：**多节点协同检索 + 聚合裁决回答**。

- 不是把所有节点原始数据直接汇总到单机；
- 而是在查询时由各节点独立检索后返回结果；
- 再由中心聚合层统一裁决，输出交互界面的最终答案。

简化链路：

```text
前端聊天提问
   -> Next.js BFF API
      -> central_server.py (/ask)
         -> 多个 node_server.py (/query)
            -> 各节点返回候选答案
         -> 中心聚合裁决（confidence / 后续可升级为 Judge LLM）
      -> 前端渲染最终回答 + 节点明细
```

---

## 1.3 第一阶段前端成果回顾（详细）

> 本章专门记录第一阶段已完成/已定型的前端资产，作为第二阶段联调基线。

### 1.3.1 总体完成内容

- 已形成多窗口产品形态（登录 / 产品介绍 / 主交互 / 数据库 / 宏观可视化）；
- 已建立前端统一视觉基调与核心交互路径；
- 已具备较完整的本地 mock 交互能力（含聊天、数据库、图谱与宏观联动的展示流）；
- 前端中已有 `app/api/**/route.ts` 模式实践，可直接承接第二阶段 BFF 对接。

### 1.3.2 分窗口前端能力（阶段一）

#### Window 1（登录与注册）

- 完成开场动效与阶段化转场（介绍态 -> 登录态）；
- 已支持登录 / 注册切换流程（含“返回登录”“申请中”状态文案）；
- 已形成阶段化视觉节奏，具备进入主系统的稳定入口。

#### Window 2（宏观可视化）

- 已形成 D1~D5 视图与联动框架；
- 已具备节点选择、板块切换、图表/词云展示等前端展示能力；
- 可作为第二阶段“多节点返回结果可视化”承载层继续扩展。

#### Window 3（数据库）

- 已形成聚类列表 -> 聚类详情 -> 文件管理的完整闭环；
- 已有增删改查 API 调用链（`/api/database/**`）；
- 具备后续接入真实后端存储与权限规则的前端基础。

#### Window 4 （交互对话）

- 完成对话面板主流程（提问、回答、状态切换）；
- 已有模型配置交互入口与相关 API 调用模式；
- 已有“溯源/知识图谱”二级展示路径，为后端真实数据接入预留位。

### 1.3.3 第一阶段沉淀价值（对第二阶段的意义）

- 已具备成熟 UI 容器与交互通路，第二阶段可聚焦后端联调而非重做前端骨架；
- 已有 API 路由与调用习惯，可低成本切到统一 BFF 策略；
- 前端状态管理与窗口流转已可支撑真实后端分步接入与灰度验证。

---

## 1.4 第二阶段目标（后端对接）

### 1.4.1 目标定义

- 将聊天回答从“前端 mock / 本地模拟”切换为“中心 + 节点协同真实链路”；
- 保证回答返回包含主答案与节点明细，支持可解释展示；
- 完成基础健壮性：超时、异常节点降级、错误提示、限流与安全校验。

### 1.4.2 当前后端基线

- `central_server.py`：中心聚合服务，`POST /ask`；
- `node_server.py`：节点服务，`POST /query`，`GET /health`；
- 节点通信采用 SM4 加密字段传输（`encrypted_query` / `encrypted_result`）。

---

## 1.5 Next.js 与 Vercel 官方最佳实践

### 1.5.1 接口文件放置

- 推荐使用 App Router 的 Route Handlers：`app/**/route.ts`；
- 前端统一调用同域 API（`/api/...`），避免前端直接暴露外部后端地址与密钥。

### 1.5.2 BFF（Backend for Frontend）模式

- 对“前端调用外部后端”场景，采用 BFF 最稳妥；
- 在 Route Handler 中进行：参数校验、鉴权、限流、日志、错误归一化，再转发到中心服务；
- 前端仅关注业务字段，不直接承受多后端差异。

### 1.5.3 `proxy.ts` 的使用边界

- `proxy.ts` 更适合全局边界能力：安全头、请求打标、重定向；
- 不建议承载慢查询或复杂业务数据聚合逻辑；
- 业务聚合仍应在 `app/api/**/route.ts` 内实现。

### 1.5.4 安全与配置建议（Vercel）

- API 至少具备：鉴权、输入校验、授权、限流、错误处理；
- 任何密钥不得使用 `NEXT_PUBLIC_*`；
- 可结合 Vercel WAF 或 `@vercel/firewall` 实施路径级/代码级限流。

### 1.5.5 部署架构建议

- Next.js（前端 + BFF）与 Python 多节点服务分离部署；
- 不建议把三台 `uvicorn` 常驻节点直接塞进 Next.js 运行时；
- 推荐独立部署中心与节点（容器/VM/独立服务），Next BFF 通过内网或受控地址访问。

---

## 1.6 建议目录规范（第二阶段）

```text
apps/main-platform/
  app/
    api/
      federation/
        ask/
          route.ts        # 前端统一调用入口（BFF）
        health/
          route.ts        # 联调健康检查（可选）
  lib/
    server/
      federation/
        central-client.ts # 调用 central_server.py
        schemas.ts        # zod/类型校验
        errors.ts         # 错误归一化
  app/windows/main/
    services/
      federation-chat-api.ts # 前端调用封装
```

---

## 1.7 联调执行顺序（建议）

1. 打通 `BFF /api/federation/ask` 到 `central_server.py /ask`；
2. 在 Window 3 聊天面板切换到新接口；
3. 增加超时、失败节点降级与前端错误态；
4. 增加请求日志与 request-id（便于跨服务排障）；
5. 补充限流与安全检查，再做阶段验收。

---

## 1.8 第二阶段验收标准（初版）

- 能稳定返回“聚合答案 + 节点明细”；
- 任一节点故障时，系统仍可部分可用并给出可理解反馈；
- 前端不暴露后端密钥与内网地址；
- Window 3 主流程在真实后端下可完成端到端问答。

---

## 1.9 参考（官方文档）

- Next.js Route Handlers：
  - https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Next.js Backend for Frontend Guide：
  - https://nextjs.org/docs/app/guides/backend-for-frontend
- Next.js Proxy（`proxy.ts`）说明：
  - https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Vercel Next.js 与安全实践：
  - https://vercel.com/docs/frameworks/full-stack/nextjs
  - https://vercel.com/academy/nextjs-foundations/security-review-apis-and-config
  - https://vercel.com/kb/guide/add-rate-limiting-vercel

# 2. 节点通信

## 2.1 本次会话代码操作总览

本节按**实际执行顺序**完整记录本次聊天中所有代码相关操作（含检索/读取、文件新增、文件修改、验证命令、临时产物清理）。

---

## 2.2 规划阶段操作（未改业务代码）

### 2.2.1 代码检索与上下文读取（只读）

1. 全局检索前端聊天链路、`central_server.py`、`node_server.py` 现状与调用关系。
2. 检索并读取规则文件（`AGENTS.md`）：
   - 仓库根 `AGENTS.md`
   - `apps/main-platform/AGENTS.md`
   - `apps/main-platform/app/api/AGENTS.md`
   - `apps/main-platform/app/windows/main/AGENTS.md`
3. 读取架构文档现状：
   - `docs/architecture/modules-index.md`
   - `docs/architecture/extension-review-checklist.md`
4. 检索并确认联邦 BFF 目录尚未落地（`app/api/federation/**` 不存在）。
5. 读取核心业务文件确认接入点：
   - `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
   - `apps/main-platform/app/windows/main/MainWindow.tsx`
   - `apps/main-platform/app/api/model-config/connect/route.ts`
   - `README_2.md`、`README.md`

### 2.2.2 计划文件操作（规划产物）

6. 新建计划文件：
   - `c:\Users\Admin\.windsurf\plans\federation-chat-contract-freeze-plan-8907e4.md`
7. 根据用户 6 项确认决策，更新计划文件第 F 节（由“待确认”改为“已冻结决策”）。
8. 执行 `exitplanmode`，进入实施阶段。

---

## 2.3 实施阶段：新增文件

### 2.3.1 Next.js 服务层（federation）

1. 新增 `apps/main-platform/app/lib/server/federation/schemas.ts`
   - 定义联邦请求/响应 schema：`FederationAskRequestSchema`、`CentralAskResponseSchema`、`FederationAskResponseSchema`。
   - 定义节点明细类型与错误体结构。

2. 新增 `apps/main-platform/app/lib/server/federation/errors.ts`
   - 新增 `FederationHttpError`。
   - 提供 `toFederationErrorResponse()` 做错误归一化（`code/message/requestId/details`）。

3. 新增 `apps/main-platform/app/lib/server/federation/central-client.ts`
   - 实现 `askCentral()`：调用中心服务 `/ask`，处理超时、上游错误、响应校验。
   - 实现 `checkCentralHealth()`：调用中心服务 `/health`，返回规范健康结构。
   - 支持环境变量：`FEDERATION_CENTRAL_BASE_URL`、`FEDERATION_CENTRAL_TIMEOUT_MS`、`FEDERATION_CENTRAL_HEALTH_TIMEOUT_MS`。

### 2.3.2 Next.js BFF 路由

4. 新增 `apps/main-platform/app/api/federation/ask/route.ts`
   - 落地 `POST /api/federation/ask`。
   - 处理请求解析、schema 校验、`request-id` 透传、错误归一化、日志。

5. 新增 `apps/main-platform/app/api/federation/health/route.ts`
   - 落地 `GET /api/federation/health`。
   - 聚合中心健康 + 可选节点直连健康（`FEDERATION_NODE_HEALTH_URLS`）。

### 2.3.3 前端调用封装

6. 新增 `apps/main-platform/app/windows/main/services/federation-chat-api.ts`
   - 封装 `askFederationChat()`。
   - 定义 `FederationChatError`。
   - 统一解析成功/失败 payload，前端只消费稳定结构。

### 2.3.4 环境变量示例

7. 新增 `apps/main-platform/.env.example`
   - 给出联邦链路所需环境变量模板：
     - `FEDERATION_CENTRAL_BASE_URL`
     - `FEDERATION_CENTRAL_TIMEOUT_MS`
     - `FEDERATION_CENTRAL_HEALTH_TIMEOUT_MS`
     - `FEDERATION_NODE_HEALTH_URLS`（可选）
     - `FEDERATION_NODE_TIMEOUT_MS`
     - `FEDERATION_SM4_KEY`

---

## 2.4 实施阶段：修改文件

### 2.4.1 前端聊天主链路

1. 修改 `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
   - 新增 `askFederationChat`、`FederationChatError` 引入。
   - 新增 `buildFederationReplyText()`：格式化主答案、节点明细、请求 ID。
   - 新增 `buildFederationErrorReply()`：归一化联邦异常文案。
   - 改造 `handleSend()`：
     - `global` 模式走 `askFederationChat()`；
     - `local` 模式保留 `resolveMockReply()`；
     - 保留原有思考延迟 + 流式输出动画。

### 2.4.2 Python 中心服务

2. 修改 `central_server.py`
   - 新增 `load_sm4_key()`：改为环境变量 `FEDERATION_SM4_KEY`。
   - 新增 `resolve_node_timeout_seconds()`：读取 `FEDERATION_NODE_TIMEOUT_MS`（默认 8000ms）。
   - `AskResponse` 增加字段：`status`、`request_id`。
   - 新增 `resolve_status()`：统一 `ok/partial/error` 语义。
   - 修改 `POST /ask`：
     - 接收并透传 `x-request-id`（无则生成 UUID）；
     - 向节点请求时附加 `x-request-id`；
     - 返回 `status + request_id`。
   - 新增 `GET /health`：并发探测各节点 `/health` 并返回聚合状态。

### 2.4.3 Python 节点服务

3. 修改 `node_server.py`
   - 新增 `load_sm4_key()`：改为环境变量 `FEDERATION_SM4_KEY`。
   - 新增 `normalize_node_id()`：统一 `node_a -> nodea`，避免知识表 key 不匹配。
   - 修改 `POST /query`：读取 `x-request-id` 并打印节点日志。

### 2.4.4 联邦服务层二次收敛（当次重构）

4. 二次修改 `apps/main-platform/app/lib/server/federation/central-client.ts`
   - 将 `askCentral()` 的 `requestId` 参数显式为 `string`，修复类型约束。
   - `checkCentralHealth()` 从中心 `/health` 读取状态。
   - 成功响应优先使用中心返回的 `request_id`。
   - 去掉 `z.treeifyError` 依赖，改为稳定 `result.error.issues`。

5. 二次修改 `apps/main-platform/app/api/federation/health/route.ts`
   - 新增 `extractCentralNodeResults()`。
   - 合并“中心返回节点健康”与“可选直连节点健康”，去重后统一输出。

### 2.4.5 架构文档同步（职责变化强制更新）

6. 修改 `docs/architecture/modules-index.md`
   - 补充联邦 BFF（`ask/health`）已落地。
   - 补充服务层 `federation` 目录职责。
   - 补充 Window4 前端调用封装职责（仅 `global` 走联邦）。

7. 修改 `docs/architecture/extension-review-checklist.md`
   - 追加 `2026-04-28 - Window 4 global 联邦聊天链路正式接入` 审查记录。
   - 记录主责/协同文件、扩展性结论、重构动作、风险与后续。

---

## 2.5 验证与质量检查操作

1. TypeScript 编译校验（多次执行）：
   - `pnpm --filter main-platform exec tsc --noEmit`
   - 结果：通过。

2. Python 语法校验（多次执行）：
   - `python -m py_compile central_server.py node_server.py`
   - 结果：通过。

3. 变更核对：
   - 执行 `git status --short` 检查最终变更集。

4. 临时产物清理：
   - 删除 `__pycache__/`。
   - 恢复 `apps/main-platform/tsconfig.tsbuildinfo`，避免将编译缓存纳入业务改动。

---

## 2.6 本次会话最终代码变更清单（落盘）

### 新增文件

- `apps/main-platform/.env.example`
- `apps/main-platform/app/api/federation/ask/route.ts`
- `apps/main-platform/app/api/federation/health/route.ts`
- `apps/main-platform/app/lib/server/federation/central-client.ts`
- `apps/main-platform/app/lib/server/federation/errors.ts`
- `apps/main-platform/app/lib/server/federation/schemas.ts`
- `apps/main-platform/app/windows/main/services/federation-chat-api.ts`

### 修改文件

- `apps/main-platform/app/windows/main/components/ChatInteractionPanel.tsx`
- `central_server.py`
- `node_server.py`
- `docs/architecture/modules-index.md`
- `docs/architecture/extension-review-checklist.md`

### 规划阶段产物（非业务运行代码）

- `c:\Users\Admin\.windsurf\plans\federation-chat-contract-freeze-plan-8907e4.md`（创建 + 更新）

# 3. 历史记录

我们将要改变交互对话页面布局，新增查看历史会话记录功能

## 3.1 改造前准备

### 3.1.1 改造前的页面布局结构与问题排查

整个交互对话页面目前大致看作三个部分：
1. 位于整个窗口顶部的长条导航栏
2. 点阵状背景，与鼠标位置有交互动画
3. 由四条线条 GSAP 绘制、并动态展开扩大的 SVG 矩形画布

模型配置页面是在信息流页面层级之上的，但也是与信息流页面 SVG+GSAP 相同形式制作的（可能只是一些动画速度参数或者配色参数不一样），由于其 SVG 画布位置参数完全一致，故将其看作同一个部分，若要修改位置参数，理应同步修改这两个层级。

需要注意的是，这张 SVG+GSAP 的矩形画布并非简单的 div 模块，而是严格约束在四条直线所框定的矩形区域内的，当直线的位置参数变化了，整个 SVG 画布的位置和内容元素，必然会同步变化。

检查后发现，改造前存在两个结构性问题：

1. 聊天区和模型配置区的位置并未动态同步，而是机械地将位置参数写成一样的
2. 画布内所有元素（按钮、气泡、输入框、信息流、模型配置内的所有元素）的位置均以整个窗口为基准界定，而非按照 SVG 画布的位置同步界定——如果横向平移 SVG 背景，那些按钮、气泡的绝对位置根本不会随之改动

### 3.1.2 坐标驱动布局重构（已完成）

#### 目标

将交互对话页面所有 HTML 覆盖层的定位，从散落的硬编码值（`25%`、`-15vw`、`calc(25% + 18px)` 等）统一改为由 `coords.ts` 坐标常量实时推算，统一处理 `preserveAspectRatio="xMidYMid slice"` 缩放映射，确保视觉效果与改造前完全一致，为后续历史记录栏扩展打好底座。

#### 坐标映射模型

新增两个纯工具函数至 `app/windows/shared/coords.ts`：

- **`svgToCssPx(containerW, containerH, coords)`**：将 SVG viewBox 内的矩形坐标换算为 CSS 像素位置，统一处理 `xMidYMid slice` 缩放偏移
- **`svgShiftPx(containerW, containerH, fromCoords, toCoords)`**：计算两个画布状态之间的 CSS 像素位移量，替代 GSAP 动画中的 `-15vw` 等魔法值

数学等价验证（125% 缩放，物理屏 1440×900 → CSS 视口 1152×720）：

- `svgToCssPx` 算出的 `left` = 288px = 25% of 1152 
- `svgShiftPx(EXPANDED → MENU_OPEN).dx` = -172.8px = -15vw 

#### 改动文件

| 文件 | 改动内容 |
|---|---|
| `app/windows/shared/coords.ts` | 新增 `CanvasRect` 类型、`svgToCssPx`、`svgShiftPx` |
| `app/windows/main/components/ChatInteractionPanel.tsx` | 新增 `layerRef`（挂根节点）、`containerSizeRef`、`updateLayoutVars`、`ResizeObserver`；3 处 GSAP `-15vw` 全部替换为 `svgShiftPx` 计算值 |
| `app/styles/window-3-main.css` | `.chat-interaction-panel` `left/right` 改为 `var(--w4-canvas-left/right, 25%)`；`.mc-canvas-close-anchor` `right` 改为 `calc(var(--w4-canvas-right, 25%) + 18px)` |
| `docs/architecture/modules-index.md` | 补充新增工具函数说明 |
| `docs/architecture/extension-review-checklist.md` | 追加本次重构的扩展性审查记录 |

#### 运行机制

1. `ResizeObserver` 监听 `.chat-interaction-layer` 根节点，容器尺寸或浏览器缩放变化时自动触发
2. 以 `MAIN_CANVAS_EXPANDED` 坐标为基准推算 CSS 像素值，通过 `element.style.setProperty` 写入 `--w4-canvas-left` / `--w4-canvas-right` 两个 CSS 变量
3. 子元素 CSS 读取变量定位，GSAP 菜单动画读取 `svgShiftPx` 动态计算位移，不再有任何硬编码百分比
4. CSS 变量 fallback 值保留为 `25%`，确保 SSR 首帧与 JS 未执行时的视觉不跳变

#### 扩展说明

后续历史记录栏接入时，只需修改 `MAIN_CANVAS_EXPANDED.x1/x2` 等坐标常量，HTML 层的定位将自动跟随，无需再次散改 CSS 百分比。

### 3.1.3 信息流区域原始态

#### 目前我们有四条线：
cc-line-left（左竖线）  | 左竖线 x = 504（0.35*1440）
cc-line-right（右竖线） | 右竖线 x = 936（0.65*1440）
cc-line-top（上横线）   | 上横线 y = 207（0.23*900）
cc-line-bottom（下横线）| 下横线 y = 747（0.83*900）

#### 默认展开态（入场后、菜单关闭）

左竖线 x = 360
右竖线 x = 1080
上横线 y = 0
下横线 y = 900

#### 菜单展开态 MAIN_CANVAS_MENU_OPEN

左竖线 x = 144
右竖线 x = 864
上横线 y = 0
下横线 y = 900

### 3.1.4 信息流区域修改后状态


#### 线与线之间距离（px）
指的是“同方向两条线”的间距：

初始态

两竖线间距：936 - 504 = 432px
两横线间距：747 - 207 = 540px

展开态（菜单关）

两竖线间距：1080 - 360 = 720px
两横线间距：900 - 0 = 900px

菜单展开态

两竖线间距：864 - 144 = 720px
两横线间距：900 - 0 = 900px

### 3.1.4 信息流区域修改后状态

#### 目前我们有四条线：
cc-line-left（左竖线）  | 左竖线 x = 604（0.35*1440 + 100）
cc-line-right（右竖线） | 右竖线 x = 1036（0.65*1440 + 100）
cc-line-top（上横线）   | 上横线 y = 207（0.23*900）
cc-line-bottom（下横线）| 下横线 y = 747（0.83*900）

#### 默认展开态（入场后、菜单关闭）

左竖线 x = 460
右竖线 x = 1180
上横线 y = 0
下横线 y = 900

#### 菜单展开态 MAIN_CANVAS_MENU_OPEN

左竖线 x = 244
右竖线 x = 964
上横线 y = 0
下横线 y = 900

#### 线与线之间距离（px）
指的是“同方向两条线”的间距：

初始态

两竖线间距：1036 - 604 = 432px
两横线间距：747 - 207 = 540px

展开态（菜单关）

两竖线间距：1180 - 460 = 720px
两横线间距：900 - 0 = 900px

菜单展开态

两竖线间距：964 - 244 = 720px
两横线间距：900 - 0 = 900px

## 3.2 期望改造状态

为什么我要控制画布和画布内部元素的相对位置不变呢，因为后续我可能会改变线条的坐标，进而改变画布相对于整个窗口的位置，例如右移，留出左侧的空间来放置“历史记录“功能栏

1、将当前所有竖线（包括初始的，展开后的）向右移动100px，则信息流和模型配置的SVG画布区域及其内部所有东西也会随之改变，右移（已完成，详见3.1.4）

2、初始状态：新增一条竖线，初始态下坐标大致为100px左右，从上往下画，颜色，线条，动态等参数全部与其它竖线完全一致
展开态：这条竖线以同样的展开动态参数，向右移动到200px左右

3、在展开的过程中会将那原来的四根线间的区域动态扩张出画布，我需要你深度学习当前这个画布的出现动态逻辑————
接下来，我们不是新增了一根竖线吗，我们现在将整个屏幕的左边界和这根线，和上下原来的两根竖线一起，看作新的矩形区域，在这个矩形区域展开的过程中，完全仿照代码中之前实现的同样的动态逻辑，也扩张出一张画布，填充色保持一致

## 3.3 布局

我们将这个新建的左侧画布，作为这个窗口的左侧工具栏，注意，内部元素、按钮、任何内容的加入，都并非在屏幕一打开就显现，而是严格地等待线条绘制完成并且画布扩张完成后，才动态淡入这些内容，具体淡入方式可以参考信息流栏目所有的元素是怎样动态呈现的，运用了什么组件库、UI库。

这个左侧工具栏需要有以下几个功能
一个长条形圆角按钮，内容物为：一个代表新建对话的图标 + “新建对话” 这四个字
下面用一条淡色线分隔，淡色横线的参数可以参考模型配置页面的分隔线css参数
分割线以下，用一个小字标题写明，“最近对话”
小标题以下区域，放置对话的历史记录，每当我新建对话、或是切换到别的页面再重新回到交互对话页面了，抑或是重启web了，都会自动地将我们本次的所有对话流（气泡输入内容、输出内容），进行储存，以本次对话流的最初的我的问题作为此最近对话（历史记录）的前15个字+省略号作为标题，在“最近对话”这个标题下方以头插法形式，制作成一个横栏，横栏的概念类似于数据库窗口的一条一条聚类或者是聚类中的一条一条文件这个前端包装形式，最近新增的对话会处于最上方，最靠近小标题的地方
注意：当信息流内没有输入任何内容时，当然不需要新建一个空的横栏了

这个横栏需要赋予一个删除按钮，按下后仿照数据库单个聚类横栏右侧的删除按钮弹出的小弹窗询问是否确认删除

按下某个横栏（也就是说我要开始查看某个记录了），这个时候交互对话窗口的整个信息流画布以动态的样式替换为这份历史记录里的气泡和内容，也就是说你需要做很复杂的记忆储存工作。储存数据的数据库技术栈，请严格使用prisma SQL（指的是采用 Prisma 驱动的 PostgreSQL数据库管理系统）作为技术栈！！！你需要联网搜索有关这个技术栈的实现方法。这个查看记录我认为是最难的交互了，你必须考虑到位。
比如我按下了某个历史记录横栏，呈现出了之前的对话信息流，实际上替换的部分只是输入框以上的内容，变成了之前的东西，如果我要在这个历史对话的基础上继续对话，其实是完全可以的且不影响的，正常在输入框打字发送就行了，这里我们暂且不考虑复杂的后端上下文联动逻辑，但是如果你有余裕的话请制作一个先进的后端接口，便于后续真正实现后端上下文逻辑对话代码的接入。

总的来说，这一部分其实给你自由发挥的空间较大，往日我们做前端项目我都会把单个窗口的样式用很多很多的文字约束规范好，让你完全按照我的意愿做，但是这一次我感觉我还是给你很多的发挥空间的，具体的样式主题，你可以仿照这个项目某个页面的主题，或者就是与交互对话页面的主题保持相似，一些按钮组件你都可以照搬这个项目中的某些已经制作好的按钮组件，改一改参数之类的就行，都给你自由发挥。


### 当前困境

你说，已完成修复：

点击 新建对话 现在会立即创建空会话占位，左侧会马上出现可选历史项。
前端历史请求统一为一个严格请求函数，覆盖：
网络异常
HTTP 非 2xx
JSON 解析失败
并统一 toast/侧栏错误展示（不再静默）
历史侧栏增加状态可见性：加载中 / 暂无会话 / 错误信息。
API 层新增统一错误归一化（数据库不可用/记录不存在/关系错误分级状态码）。
服务层创建会话能力扩展为“支持空会话 + 有消息会话”，并统一默认标题策略 新建对话。
到此结束，以上为你的反馈。

但是，并没有如愿地正常显示问题答案

显示：数据库暂不可用，请检查 DATABASE_URL 与数据库服务

我其实有一个猜想，你可以阅读一下readme_2.md关于节点通信的内容，我猜想：
1、在关于节点通信的代码修改伤害了原有的成熟代码结构，导致普通节点和中心节点的权能出现混淆；并且，对于到底在重启网页后哪些元素是初始化，哪些内容是要被永久保存记录下来的，很混乱（比如我自己的节点是否为中心节点，还有申请成功后理应不再变动，或是我们在申请按钮的旁边再放一个“恢复普通节点”的按钮，而不是一重启就又变绿）
2、仍然是第1条的原因，导致的第二个问题就是我现在可能因为模型都配置了，并且曾经申请成为过中心节点，但是我就算是重启网页又变成普通节点，系统好像仍然默认了我有中心节点的权能，即——可以在交互页面轻易切换本地/全局的按钮
3、我不知道是不是节点通信的两个py文件原代码强制要求了你必须配置某些url或者api，导致我现在完全没法测试出来到底能不能正常显示出前端的历史记录横栏，显示数据库暂不可用，请检查 DATABASE_URL 与数据库服务。

我现在很困扰，担心这次节点通信伤害了很多重要的代码逻辑。因为我做前端不可能一上来就把api url什么的配好，所以必然要提前mock一点状态好让我想看到的东西出现，不可能说因为某些东西没配置我就一直看不到这部分内容，自然也看不到这部分的前端样式。
但是，毕竟我们现在已经再开始做对接工作了，未来是想抛弃mock，真正实现系统功能的，所以我现在很矛盾，到底现在就要做真做实，还是说为前端让步，毕竟前端确实还要改好多东西、新增好多东西。

### 关于历史记录条目的问题

一、
检查触发历史记录新横栏生成的条件：
1. 时机条件（三者任一）
新建对话时 - 用户点击"新建对话"按钮创建新会话
页面切换回来时 - 用户切换到其他页面后，重新回到交互对话页面
重启web时 - 浏览器刷新或应用重启后
2. 内容条件（关键前提）
对话流非空 - 信息流中必须有用户输入内容
不会触发：当信息流内没有任何输入内容时
会触发：只有当对话流中至少包含一条用户消息时

二、
当前存在的问题
1、我无法交互按下之前的历史记录横栏按钮，它好像无法交互，此外我补充一下，它按下后应该会在右侧信息流栏目显示曾经的内容。这里的要求很高，涉及到你需要全盘记忆下气泡内输入输出内容到prismaSQL（话说SQL是用来做这种事的吗）并在按下后调用它并正常显现出来。
2、对于单个历史记录横栏，按下删除按钮，弹出确认弹窗，结果发现“确认删除”按钮居然按不了，它根本无法交互，我需要你不仅要恢复它的交互，而且交互的hover样式要做的跟数据库单个聚类删除窗口的确认删除按钮效果一模一样，你直接照搬就行。

### 历史记录全流程详细描述

由于目前新横栏的动态生成，其它元素动态下移让位等细节问题漏洞百出，整体动效混乱且重叠，并且许多地方无法点击，十分卡顿，总之就是整体十分粗糙————所以，我在此不得不介入，我接下来会整体描述一下我想要的到底是一个什么样的效果，有什么注意点，供你逐字对照检查优化。
首先，你要明白，历史对话一旦创建就必然被PrismaSQL数据库记录进代码内存，无论是否重启web、无论是否前往了其它页面又回来，都会一直存在，所以最近对话以下的横栏如果一直不删除的话，是不会消失的。
假设此时我未使用过这个交互对话功能，此时显然没有任何的历史记录，最近对话以下应该什么都没有，并且显示暂无会话。
此时，我在本地模式的信息流里，输入了一串问题，按下发送，此时，应该在短暂的时间内延迟生成一条新的会话横栏在最近对话的本地模式下方，并且这条横栏的生成方式也很讲究：
初始状态：
最近对话（大字号）
本地模式
暂无会话
全局模式
暂无会话
此时状态：
最近对话（大字号）
本地模式
【新的历史记录横栏】
全局模式
暂无会话

以上，不难看出，将会在本地模式小标题下出现一个历史记录横栏，（内容为我输入的内容的前15个字）
此处注意（MVP）:“动态出现”的具体步骤是：
第一阶段 0-0.1s：“本地模式”小标题下“暂无会话”这几个字迅速淡出消失
第二阶段 0.1-0.4s：本地模式以下的前端元素（包括“全局模式”、“暂无对话”）以慢快慢的速度形式下移，留出单个历史记录横栏所需要的高度以后续安置横栏。
0.4s：此时显然“最近会话”和“全局模式”之间已经留出了一定上下距离的空间。
注意：如果本来本地模式就不是“暂无对话”状态，跳过第一阶段，直接执行第二阶段（总时长0.3s），我会在README_2.md第618行详细阐述）
第三阶段 0.4-0.7s：在这个空间中，以从左到右从小到大的快慢快动态形式如果冻般极具动态感和高级感地浮现出新的历史记录横栏。
0.7s时，左侧功能栏所有动态播放完成，标志着第一个历史记录横栏出现了。
当然，这个时候右侧的信息流栏目肯定是一直在跑输出结果气泡的，它们互相不影响。

接下来，当我按下新建会话按钮，意味着我想要清空信息流栏目，要开一个新的对话，也意味着我们的前一个输入输出将会被系统记录在案（注：我们必然支持轻点hover这个历史记录横栏，当我们按下它，右侧的信息流栏目又会显现我们之前的那些历史记录，详见此README_2.md的第585行），那么，此时，会发生如下的事件：
0s：右侧信息流清空了，此时由于本地模式并不是暂无对话了，显然已经有了一个历史记录横栏了。
0-0.3s：本地模式以下的所有前端元素（包括已有的横栏、“全局模式”字样、“暂无对话”字样）以慢快慢的速度形式迅速下移，在“本地模式”和上个横栏之间，留出一个历史记录横栏所需要的高度以后续安置横栏。
0.3-0.6s：以同样的方式，动态浮现出新的历史记录横栏。此时横栏的内容应该是“新建会话”，文字和横栏模块以相同动态浮现出来。

此时，我如果在这个新的信息流窗口内输入了一个问题并点击发送，在短暂延迟后，这个新的横栏内部的文字将动态替换成我这个新问题的前15个字加省略号，记住，这里需要淡入淡出的动效。

技术栈：GSAP+时间轴+其它某些先进组件，你需要先阅读原版README第1080-1129行：#### 【GSAP 动效与技术栈细节补充指示】 和 #### 【D3 渲染 GeoJSON 的核心法则（The Golden Rules of GeoJSON Rendering）】这两份文件，之后你需要联网深度搜索GSAP的最佳实践。
你的动效制作绝不能闭门造车，一定是使用成熟的最先进的动效组件库，千万不要全盘手搓。


### 新的问题
1、
注意我这里的原话：
0-0.3s：本地模式以下的所有前端元素（包括已有的横栏、“全局模式”字样、“暂无对话”字样）以慢快慢的速度形式迅速下移，在“本地模式”和上个横栏之间，留出一个历史记录横栏所需要的高度以后续安置横栏。
此处，你要注意了（MVP），所谓的下移，当然是所有元素同步的下移，而不是独立地这个下移那个也下移，我的意思是下移的px距离显然应该一致。
并且问题最大的是，原横栏下移量太多了，只需要下移到能够在上方出现新的横栏就够了。
2、
关于输入输出气泡的记忆存在大问题，直接导致了我按下单个横栏时，显示“Conversation not found”，根本无法跳转到那个原来的信息流页面，给不到我原来的输入输出气泡了，非常糟糕，这是因为我们缺乏对prismaSQL理解，没有搞明白它到底怎样来实现我们现在的信息永久记忆需求，导致根本无法调用，甚至无法永久保存。你需要深度搜索PrismaSQL的最佳实践及其应用论文，探求其有什么用，怎么用等问题。
3、第三点再强调一下这里的无法保存：我都已经让你修了好几次了，还是修不好————历史记录及其在左侧功能栏里显示的横栏，都将永久保存在代码里，具体技术栈是prismaSQL，无论是我叉掉网页后重新进入，还是说我切换到了别的功能窗口又切换回交互对话窗口，都必须保证历史记录及其横栏永久存在，除非我手动按下删除按钮。


# 4. 管理员模式

对于使用本系统的每个用户的一些重要操作：
一、注册账号
二、更改节点名称
三、更改节点位置
四、申请成为中心节点
五、申请还原为普通节点
六、配置法官模型
由于以上操作较为重要，而普通用户并不具有决定以上操作的权力，所以我们设置了一个管理员账号，管理员账号拥有其它用户不拥有的一个管理员窗口，在这个窗口里管理员可以收到其它普通用户进行以上操作的申请准许的请求（不是口头上的请求，而是按下某个按钮后通过后端的节点通信服务器传来一份请求数据）
我将管理员的账号具体描述如下：
1、在PrismaSQL数据库中创建一个用来储存账号信息的文件夹，实时监测要注册的账号和对应的密码
2、设置一个默认存在的管理员账号——账号：admin 密码：311311
3、当我输入的是SQL数据库中不存在的账号时，显示“账号不存在，请注册”
4、前往注册页面，输入我想要注册的账号密码，按下“申请注册按钮”，应该显示“正在申请注册”，此时处于等待管理员同意申请的状态。用户按下按钮的那一刻，发送信号到后端节点通信服务器，传输到管理员的管理员页面，等到管理员同意申请，再发送信号给想要注册者，此时显示注册成功，用户可返回到登录页进行登录。
5、前1、2、3、4点主要讲了进行重要操作“一”（注册账号）的具体逻辑，剩下的重要操作二、三、四、五、六同理。
5、当我输入的是管理员账号密码时，直接进入，无需获得许可。
6、登入管理员账号后进入的系统页面跟正常页面完全一致，唯一不同的就是，顶部导航栏右侧，头像圆圈左侧，将会多出一个圆角胶囊形按钮，“管理员页”，当有普通用户提出了任何重要操作申请，在此“管理员页”按钮的右上角，出现一个红点，代表有用户提出申请，提醒管理员要处理。
7、管理员点击这个“管理员页”按钮，将会跳出管理员操作窗口，窗口的前端包装框架与“用户信息设置页面”样式和尺寸都一致。
下面重点讲述此管理员操作窗口的前端样貌：
大标题：管理员操作页
小标题：用户信息
此处给定一个固定高度的区域，在此区域内展示已有的成功注册的用户的横栏，每个用户拥有一个横栏，横栏从上到下排列，若超出了给定的该区域固定高度，支持鼠标上下滚动查看每条用户横栏。
此横栏展示四个信息：
账号（显示该用户登录时输入的账号）    节点名称（即该用户在用户信息设置页面申请成功后保存的节点名称）  文献量（这里给出此节点在数据库窗口储存了共多少文件，把每个聚类内有多少文件加起来，展示数字）   普通节点/中心节点（节点有两个状态，要么显示普通节点，要么显示中心节点）
小标题：用户申请
此处也给定一个固定高度的区域，在此区域内，当用户如上文所述发出了进行重要操作的申请，则在此区域内新增一个横栏。若超出了给定的该区域固定高度，支持鼠标上下滚动查看每条用户横栏。
此横栏展示三个信息： 
账号   申请（显示其申请的重要操作是哪个）    备注（一般为空，如果是更改节点名称，此处显示其要改成什么名称）
此横栏最右侧，做一个按钮，“同意”，管理员按下后则发送同意申请信号，发送同意申请的信号成功后，此时此条横栏从此区域删掉，此条横栏进入下文所说的历史记录区域。
小标题：历史记录
此处也给定一个固定高度的区域，在此区域内，显示管理员在用户申请区域已经处理过（已经成功按下同意的申请）的横栏。若超出了给定的该区域固定高度，支持鼠标上下滚动查看每条用户横栏。


## SQL研究

我们的项目是基于服务器逻辑来运转的，每个用户的电脑独立拥有一个SQL来存储他自己上传进数据库页面聚类里的文件，那么在这一整个服务器里就会有很多独立的单个用户的SQL，作为权限最大的中心节点，可以通过服务器对所有人电脑上的SQL进行整合并调用，而普通节点只能本地调用自己的数据库。
你认为基于这样的大背景，到底应该怎么制作SQL才更符合项目理念？

## 请在这里撰写你根据我给你的plan你具体完成的内容条目，可以用简明易懂的话阐述，标注修改到或新建的文件

# 5. 交互对话初始态

接下来，我们将进行交互对话界面信息流区域初始状态样貌的颠覆。
在修改之前，让我们梳理一下目前的信息流样式呈现逻辑：
当切换到交互对话页面时，或是按下了新建对话按钮时，信息流窗口都默认没有任何气泡，处于空的状态，此时，无论是本地模式还是全局模式，信息流窗口中央都会有一个动态旋转的圆圈动画。

但是，由于导向性一般，信息指向不明确，用户不知道这个圆圈动画代表什么，也不知道如何开始对话。

因此，我们需要对这个初始状态进行颠覆性的修改。

首先，全面删除这两个动态旋转的圆圈动画。

然后请你联网深度搜索市面上常见的AI大模型网页版的外观样貌。

你不难能得出答案：这些AI网页版通常在一进入网页或是新建对话时，会有如下特点：
1、输入框并不位于信息流区域的最下方，而是处于中央，并且输入框上方会有一串文字提示，例如：你可以在此输入问题
2、当我们输入了问题并按下发送按钮，输入框会以美妙的动画动态下移到信息流底部，然后开始进行正常的消息生成
3、值得一提的时候，当初始状态下，输入框的从左到右的长度其实是略短一些的，这样呈现起来会很美观，待到发送问题后输入框清空并位置下移，其实不只是进行了动态下移，还有左右长度的变长这个变化，这些动态你完全可以使用GSAP来实现，切勿自造轮子，尽量使用成熟的组件库，减少自己闷头独干、按照自己掌握的知识写代码。我们要做的是一个高级感十足、美观、自然、流畅不卡顿
我认为我们可以学习这个样式，当然在事前需要注意以下几点：
1、除了原本的圆圈图案外，其它的有关信息流的内容都令我十分满意，包括输入框样式、发送问题后的气泡样式、信息流呈现方式等等，都是我们精心设计好的，所以请你不要改动，我们要做的，只是在发送操作之前，增加一些新的样式，即输入框的初始位置和移动，移动到最下面的位置其实就是现在没修改的情况下输入框的位置，其实你需要做的事并不多，千万别画蛇添足。
2、请你深度阅读信息流区域的已有代码，明确好哪些东西是不能改动的，你可以大致先明确一个时间轴，为了在前面插入这种动态而不影响原本时间轴后面要发生的事，可以将原本要发生的所有事件在时间轴上右移，为你新制作的动态留足空间。
3、需要注意的是输入框的尺寸变化，例如长度变长、内容清空则宽度恢复原长等。
4、最需要全盘考虑的，则是在新建窗口或是从本地模式切换为全局模式、从全局模式切换为本地模式、抑或是从别的窗口切换回来、甚至是重新打开项目，这里其实我们在制作这个页面的历史记录就已经有很深度的研究了，你可以查看你的memory或对应层级的Agent.md文档，以明确到底何为初始态。
5、你撰写的plan要在最后单开一个区域，将我手敲的这一大段文字逐字逐句编排整理成若干要点，放进去，作为本次优化的最终排查清单。
6、代码的修改要严格按照Next.js 与 Vercel 官方最佳实践，保证整个文件夹逻辑清晰，不会出现在一个代码文件中冗杂许多板块的代码，要分门别类，条理清晰，不堆在一起成屎山代码。

## 提示语具体样式

字号颜色：钉钉进步体，蓝色醒目大字（4300FF）

动态代码参考————GSAP：
照搬下面的文字呈现动态形式，但字体和字色等参数都要稍作修改
Usage
<template>
  <SplitText
    text="Hello, GSAP!"
    class-name="text-2xl font-semibold text-center"
    :delay="100"
    :duration="0.6"
    ease="power3.out"
    split-type="chars"
    :from="{ opacity: 0, y: 40 }"
    :to="{ opacity: 1, y: 0 }"
    :threshold="0.1"
    root-margin="-100px"
    text-align="center"
    @animation-complete="handleAnimationComplete"
  />
</template>

<script setup lang="ts">
  import SplitText from "./SplitText.vue";

  const handleAnimationComplete = () => {
    console.log('All letters have animated!');
  };
</script>
Code
<template>
  <component :is="tag" ref="elRef" :style="styles" :class="classes">
    {{ text }}
  </component>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, type CSSProperties, onBeforeUnmount, computed } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText as GSAPSplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, GSAPSplitText);

export interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string | ((t: number) => number);
  splitType?: 'chars' | 'words' | 'lines';
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  threshold?: number;
  rootMargin?: string;
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  textAlign?: CSSProperties['textAlign'];
  onLetterAnimationComplete?: () => void;
}

const props = withDefaults(defineProps<SplitTextProps>(), {
  className: '',
  delay: 50,
  duration: 1.25,
  ease: 'power3.out',
  splitType: 'chars',
  from: () => ({ opacity: 0, y: 40 }),
  to: () => ({ opacity: 1, y: 0 }),
  threshold: 0.1,
  rootMargin: '-100px',
  tag: 'p',
  textAlign: 'center'
});

const emit = defineEmits<{
  'animation-complete': [];
}>();

const elRef = ref<HTMLElement | null>(null);
const fontsLoaded = ref(false);
const animationCompleted = ref(false);

let splitInstance: GSAPSplitText | null = null;

onMounted(() => {
  if (document.fonts.status === 'loaded') {
    fontsLoaded.value = true;
  } else {
    document.fonts.ready.then(() => {
      fontsLoaded.value = true;
    });
  }
});

const runAnimation = () => {
  if (!elRef.value || !props.text || !fontsLoaded.value) return;
  if (animationCompleted.value) return;

  const el = elRef.value as HTMLElement & {
    _rbsplitInstance?: GSAPSplitText;
  };

  // cleanup previous
  if (el._rbsplitInstance) {
    try {
      el._rbsplitInstance.revert();
    } catch {}
    el._rbsplitInstance = undefined;
  }

  const startPct = (1 - props.threshold) * 100;
  const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(props.rootMargin);
  const marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0;
  const marginUnit = marginMatch?.[2] || 'px';

  const sign =
    marginValue === 0
      ? ''
      : marginValue < 0
        ? `-=${Math.abs(marginValue)}${marginUnit}`
        : `+=${marginValue}${marginUnit}`;

  const start = `top ${startPct}%${sign}`;

  let targets: Element[] = [];

  const assignTargets = (self: GSAPSplitText) => {
    if (props.splitType.includes('chars') && self.chars?.length) targets = self.chars;
    if (!targets.length && props.splitType.includes('words') && self.words?.length) targets = self.words;
    if (!targets.length && props.splitType.includes('lines') && self.lines?.length) targets = self.lines;
    if (!targets.length) targets = self.chars || self.words || self.lines;
  };

  splitInstance = new GSAPSplitText(el, {
    type: props.splitType,
    smartWrap: true,
    autoSplit: props.splitType === 'lines',
    linesClass: 'split-line',
    wordsClass: 'split-word',
    charsClass: 'split-char',
    reduceWhiteSpace: false,
    onSplit(self) {
      assignTargets(self);

      return gsap.fromTo(
        targets,
        { ...props.from },
        {
          ...props.to,
          duration: props.duration,
          ease: props.ease,
          stagger: props.delay / 1000,
          scrollTrigger: {
            trigger: el,
            start,
            once: true,
            fastScrollEnd: true,
            anticipatePin: 0.4
          },
          onComplete() {
            animationCompleted.value = true;
            props.onLetterAnimationComplete?.();
            emit('animation-complete');
          },
          willChange: 'transform, opacity',
          force3D: true
        }
      );
    }
  });

  el._rbsplitInstance = splitInstance;
};

watch(
  () => [
    props.text,
    props.delay,
    props.duration,
    props.ease,
    props.splitType,
    JSON.stringify(props.from),
    JSON.stringify(props.to),
    props.threshold,
    props.rootMargin,
    fontsLoaded.value
  ],
  runAnimation,
  { deep: true }
);

onBeforeUnmount(() => {
  ScrollTrigger.getAll().forEach(st => {
    if (st.trigger === elRef.value) st.kill();
  });

  try {
    splitInstance?.revert();
  } catch {}
});

const styles = computed(() => ({
  textAlign: props.textAlign,
  wordWrap: 'break-word',
  willChange: 'transform, opacity'
}));

const classes = computed(() => `split-parent overflow-hidden inline-block whitespace-normal ${props.className}`);
</script>

## 输入框变化新增样式

新增一项可逆变化：
原来只是位置上下变化和长度缩短伸长，现在新增一个举动：
输入框初始状态时为矩形微小圆角，下移后变为现在的胶囊样式，上移则动态还原为矩形圆角

# 6. FastAPI + MiA-RAG 后端接入

C:\Users\Admin\final\Encrypted-Smart-Graph-Federated-Knowledge-Graph-Collaborative-Retrieval-Engine-main

我的队友提供给我他的后端代码，此时此刻我们终于可以开始正式接入后端

联网调研OWASP/MDN/OpenTelemetry + FastAPI 官方仓库文档

先不配置 Qwen3-Embedding-8B 路径和各类 API Key

沿用你现有 memory 里已经确定的联邦基线（request-id 贯穿、内部令牌、TLS/本地回环例外、header 编解码对称）来做接入设计。

## Final 后端整合与联调计划
本计划将以“最小改动前端主链路、后端独立服务化接入、逐步替换 mock”为原则，把 Encrypted-Smart-Graph-Federated-Knowledge-Graph-Collaborative-Retrieval-Engine-main 完整接入 final 并形成可验证联调闭环。

 0) 目标与边界

目标：让 final 前端（尤其 Window 4 的 local/global 检索链路）可稳定调用新后端能力。
范围：
新后端目录：Encrypted-Smart-Graph-Federated-Knowledge-Graph-Collaborative-Retrieval-Engine-main。
现有桥接链路：/api/node/retrieve、/api/federation/ask、central_server.py、node_server.py。
暂不执行：
Qwen3-Embedding-8B 本地模型路径与 API Key 的最终真实值配置（待队友提供）。
生产级部署编排（本次先完成可开发联调与验收脚手架）。

1) 架构落位决策（最佳适配）

采用“后端独立服务 + 前端现有 API 路由桥接”方案：
保留 final 现有 Next 路由契约，避免 UI/调用层大改。
将新后端作为独立 Python 服务运行，按端口/环境变量接入。
原因：
与当前 ChatInteractionPanel 发送链路兼容成本最低。
与既有联邦治理（request-id、内部 token、TLS 策略）一致。
后续替换本地模型与外部 API 仅需改 env，不需重写前端调用层。

2) 深度剖析与能力映射（交付文档）

逐组剖析后端模块职责并映射到前端功能面：
api/routers/auth.py → 登录/注册/鉴权（当前前端仍是 mock 适配层）。
api/routers/documents.py → 文档上传/列表/删除（当前前端未直接对接此路由）。
api/routers/query.py → 问答与证据历史（可作为增强版 local 检索接口来源）。
api/routers/nodes.py → 节点注册/中心申请/审批（可对接现有节点权限流）。
mia_emb/* → MiA-RAG 双通道检索核心（fine/coarse + mindscape）。
node_server.py + crypto_utils.py → 节点加密查询服务与 SM4/SM3 完整性链路。
产出一份“前端功能 ↔ 后端模块 ↔ 接口契约”表，标注：
已对齐、需适配、暂缓接入三类状态。

3) 协议与契约对齐改造（最小侵入）

对齐点 A：local 检索
以 final 现有 /api/node/retrieve 返回契约为基准
将其内部检索实现切换为可调用新后端 MiA-RAG（保留回退路径）。
对齐点 B：global 联邦
保持 askFederationChat -> /api/federation/ask -> central -> node 主链不变。
新后端节点服务按当前联邦安全头和超时策略接入。
对齐点 C：认证与节点身份
延续现有 node-auth-headers（含非 ASCII header 编解码对称）。
明确 account/role/actor 在各层的来源与校验顺序。

4) 配置与运行面落地

统一配置矩阵（开发态）：
模型：MODEL_PATH（先占位，待填 Qwen3-Embedding-8B 真实路径）。
API：DEEPSEEK_API_KEY 等（先占位）。
联邦：FEDERATION_SM4_KEY、FEDERATION_INTERNAL_TOKEN、TLS/超时参数。
形成最小运行拓扑：
main-platform（Next）
central_server.py（中心）
node_server.py（单/多节点）
提供“无模型密钥下可自检模式”：仅校验链路联通、鉴权、错误语义与降级行为。

5) 验证与验收

分层验证：
接口契约验证（字段、状态码、错误体、requestId 贯穿）。
鉴权/权限验证（role=central、account ownership、internal token）。
联邦健康验证（/health、partial/error 可观测）。
前端端到端验证（Window 4 local/global 发送、结果展示、失败文案）。
验收输出：
联调检查清单（通过/失败项）。
残余风险与后续动作（仅限模型/API 凭证待补部分）。

6) 代码归属与扩展性审查（按仓库规则）

功能归属声明（实施时在交付说明中明确）：
主责：app/api/node/retrieve、app/api/federation/ask、联邦 server 连接器。
协同：ChatInteractionPanel 调用层、node_server.py、mia_emb/*。
扩展性审查重点：
多节点扩容、超时与重试、错误可观测、契约版本兼容。
必要重构门禁：
出现重复鉴权/重复错误归一化/硬编码扩散时，当次收敛重构。

7) 文档同步门禁

若实施中涉及模块职责变化，同步更新：
c:/Users/Admin/final/docs/architecture/modules-index.md
c:/Users/Admin/final/docs/architecture/extension-review-checklist.md（追加本次审查记录）

8) 实施顺序

输出“后端模块深析 + 前端映射 + 差异清单”。
冻结接入契约与配置矩阵（含占位 env）。
改造 local/global 桥接实现并保留回退。
跑分层验证与端到端联调。
完成架构文档与扩展审查记录。


### 注意点：

1、在这一整份后端文件夹中，除了有真实的法律文献数据，还有什么？请用简明易懂的话术给我将这个文件夹进行点对点的功能讲解
2、我必须要告诉你，我提供给你的后端代码还没有配入那些最基础的RAG框架，你应该没有自己自作主张编写进去吧

#### 后端文件夹里除了法律文献数据，还有什么？

data/legal_docs/ — 18份真实法律数据
民法典、刑法、刑事诉讼法、公司法、最高人民法院各类司法解释。这是这个系统的"知识库原料"。

##### 各模块点对点功能讲解

mia_emb/（你们自研的核心大脑）

mia_embedding.py — 自研嵌入模型，把一段文字变成一组数字向量，用于相似度匹配
mia_rag.py — 流水线总调度：文档入库 → 召回 → 生成答案；内部对接了 LightRAG（知识图谱框架），但有优雅降级，LightRAG 没装的话自动走纯嵌入模式
dual_channel.py — "双通道检索"：一条道找精确实体（比如某条法律条款），另一条道找语义社区（相关主题群），两路合并再排序
mindscape_summarizer.py — 调 DeepSeek API，把大段文档先摘要成"思维地图"，提升检索精度
mia_config.py — 统一配置（模型路径、API key、维度等）
multimodal/ — PDF/图片转文字，支持多模态文档入库
api/（REST API 接口层）

auth.py — 注册/登录/获取当前用户，JWT鉴权
query.py — 接收问题 → 调 MiA-RAG → 返回答案+证据
documents.py — 文件上传/列表/删除
nodes.py — 节点注册/列表/申请成为中心节点
models.py / schemas.py / deps.py — 数据库表结构、接口数据校验、依赖注入
node_server.py（联邦节点入口） 一个独立启动的服务：收到加密查询 → SM4解密 → 调MiA-RAG → 加密返回。同时也挂载了 api/ 的全部路由（可直接访问 Swagger）。

crypto_utils.py（加密工具箱） SM2密钥交换、SM3完整性校验、SM4对称加解密——国产密码算法套件，用于节点间通信安全。

scripts/（工具脚本）

demo_mia_rag.py — 完整演示：加载文档、查询、打印结果
test_mia.py — 嵌入模型单测
download_mia_lora.py — 从 HuggingFace 拉取 LoRA 权重
models/MiA-Emb-8B/ LoRA 适配器配置文件，指向基座模型（Qwen3-Embedding-8B）。

问题 2：我有没有自己把 RAG 框架写进去？
没有，我没有动任何 RAG 逻辑。

mia_rag.py 里关于 LightRAG 的代码完全是你们提供的原始代码，而且它已经写了优雅降级：

mia_rag.py:543-550
try:
    from lightrag import LightRAG
    from lightrag.prompt import PROMPTS
    from lightrag.utils import EmbeddingFunc
except ImportError:
    logger.warning("LightRAG not installed, running in standalone mode")
    self.rag = None
    return
LightRAG 没装时自动走 standalone 模式（纯嵌入），不会崩溃。这是你们自己写的逻辑。

我只做了这两件事：

node_server.py — 加了 FEDERATION_INTERNAL_TOKEN 安全检查（纯安全代码，无 RAG）
query.py — 加了 POST /api/query/internal 端点，里面只是调用了你们已有的 rag.query() 方法
rag.query() 的实现是你们 mia_rag.py 里的，我没改也没写。

Feedback submitted

### 交互对话功能讲解




