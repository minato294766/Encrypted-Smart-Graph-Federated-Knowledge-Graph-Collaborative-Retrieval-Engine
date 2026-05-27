# AGENTS.md（windows/shared）

## 作用域
本文件作用于 `apps/main-platform/app/windows/shared` 目录树。

## 模块职责
- `GlobalTopNav.tsx`：全局顶部导航与窗口切换入口。
- `ProfileModalLong.tsx`：个人信息与相关设置弹层。
- `animation.ts`：共享动画工具。
- `coords.ts`：共享坐标与映射工具。

## 开发规则
1. shared 组件禁止直接依赖某单一窗口的私有状态实现。
2. 若新增 props，必须保证向后兼容与默认行为稳定。
3. 共享工具函数必须保持纯函数倾向，避免隐式全局副作用。

## 扩展性审查重点
- 新窗口接入时是否只需配置，不需改核心逻辑；
- 共享组件是否出现“窗口特化污染”；
- 类型定义是否能覆盖未来新增字段。
