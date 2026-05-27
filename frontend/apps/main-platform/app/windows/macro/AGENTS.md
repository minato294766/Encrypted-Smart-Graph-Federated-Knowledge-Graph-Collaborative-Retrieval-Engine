# AGENTS.md（Window 2：宏观可视化）

## 作用域
本文件作用于 `apps/main-platform/app/windows/macro` 目录树。

## 模块职责
- `MacroWindow.tsx`：宏观窗口总编排与模块联动。
- `components/D1Timeline.tsx`：动态更新/时间线。
- `components/D2Visualization.tsx`：节点价值排行等图层。
- `components/D3SandboxThreeMvp.tsx`：核心 3D 沙盘交互。
- `components/D4Visualization.tsx`：曲线监测视图。
- `components/D5WordCloud.tsx`：词云视图。

## 开发规则
1. D1~D5 保持单向数据流，不允许互相直接改内部状态。
2. D3 与 D4/D5 联动契约必须集中定义，不得分散硬编码。
3. 视觉参数（颜色、动画时长、布局阈值）优先配置化。

## 扩展性审查重点
- 增加新节点/新板块时是否无需重构全部映射；
- 大数据量下是否有明显性能瓶颈（重算、重绘、抖动）；
- 3D 交互契约是否稳定可回归。
