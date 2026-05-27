# Trace 图谱替换接口说明

此文档用于后续快速替换知识图谱源文件（例如新的 `html` 导出图），避免再改组件代码。

## 1) 配置入口

配置文件：`apps/main-platform/scripts/trace_graph_pipeline_config.json`

核心字段：

- `source_html`: 新图谱 html 路径（优先）
- `source_graphml`: graphml 路径（可选）
- `target_node_count`: 压缩保留节点数（当前 300）
- `online_translate`: 是否在线翻译为中文（true/false）
- `output_json`: 前端实际读取的图谱数据输出路径
- `output_manifest`: 前端数据入口清单

## 2) 一键构建

在仓库根目录执行：

- `pnpm --filter main-platform run trace:graph:build`

构建脚本会：

- 从配置读取源文件
- 解析节点和边
- 压缩到目标节点数
- 将节点/边 tooltip 文本转成中文一行
- 生成前端读取文件与 manifest

## 3) 只换源文件的标准流程

1. 把新的图谱 html 放到本机（例如 `C:/Users/Admin/final/newgraph-v2.html`）
2. 修改 `trace_graph_pipeline_config.json` 的 `source_html`
3. 执行 `pnpm --filter main-platform run trace:graph:build`
4. 刷新页面验证

## 4) 前端读取接口（固定）

TraceWindow 第 2 页组件会优先读取：

- `/trace/trace-knowledge-graph-manifest.json` 中的 `activeDataUrl`

若 manifest 不可用，回退到：

- `/trace/trace-knowledge-graph-reduced.json`

因此后续只要更新 manifest 指向或重建输出，不需要改 `TraceKnowledgeGraph.tsx`。

## 5) 产物文件

- `apps/main-platform/public/trace/trace-knowledge-graph-reduced.json`
- `apps/main-platform/public/trace/trace-knowledge-graph-stats.json`
- `apps/main-platform/public/trace/trace-knowledge-graph-manifest.json`
- `apps/main-platform/public/trace/trace-translation-cache.json`
