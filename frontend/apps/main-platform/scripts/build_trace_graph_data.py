from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

GRAPHML_NS = {"g": "http://graphml.graphdrawing.org/xmlns"}

DEFAULT_CONFIG_PATH = Path("apps/main-platform/scripts/trace_graph_pipeline_config.json")
DEFAULT_SOURCE_HTML = Path(r"C:\Users\Admin\final\newgraph.html")
DEFAULT_OUTPUT_JSON = Path("apps/main-platform/public/trace/trace-knowledge-graph-reduced.json")
DEFAULT_OUTPUT_STATS = Path("apps/main-platform/public/trace/trace-knowledge-graph-stats.json")
DEFAULT_OUTPUT_MANIFEST = Path("apps/main-platform/public/trace/trace-knowledge-graph-manifest.json")
DEFAULT_TRANSLATION_CACHE = Path("apps/main-platform/public/trace/trace-translation-cache.json")

DEFAULT_TARGET_NODE_COUNT = 300
DEFAULT_MIN_CENTER_TREES = 5

NODE_COLOR_PALETTE = ["#A7AAE1", "#2FA4D7", "#9ED3DC", "#FEFD99", "#FCB7C7", "#CA6180"]

PHRASE_TRANSLATIONS: dict[str, str] = {
    "Civil Code": "民法典",
    "Third Party": "第三人",
    "Creditor": "债权人",
    "Debtor": "债务人",
    "entity": "实体",
    "unknown_source": "未知来源",
    "source": "来源",
    "relationship": "关系",
    "relations": "关系",
    "rights": "权利",
    "obligations": "义务",
    "obligation": "义务",
    "liability": "责任",
    "law": "法律",
    "legal": "法律",
    "contract": "合同",
    "contracts": "合同",
    "property": "财产",
    "claim": "请求权",
    "claims": "请求权",
    "framework": "框架",
    "include": "包括",
    "including": "包括",
    "provided": "规定",
    "provides": "提供",
    "provide": "提供",
    "govern": "规范",
    "governs": "规范",
    "governing": "规范",
    "regulate": "规制",
    "regulates": "规制",
    "litigation": "诉讼",
    "privacy": "隐私",
    "personal information": "个人信息",
}

TOKEN_TRANSLATIONS: dict[str, str] = {
    "and": "和",
    "or": "或",
    "the": "该",
    "of": "的",
    "to": "至",
    "in": "在",
    "on": "在",
    "for": "用于",
    "with": "与",
    "without": "无",
    "by": "由",
    "from": "来自",
    "as": "作为",
    "is": "是",
    "are": "是",
    "was": "是",
    "were": "是",
    "be": "为",
    "being": "正在",
    "been": "已",
    "this": "该",
    "that": "该",
    "these": "这些",
    "those": "那些",
    "it": "该项",
    "its": "其",
    "their": "其",
    "his": "其",
    "her": "其",
    "they": "它们",
    "between": "在...之间",
    "within": "在...内",
    "under": "在...下",
    "above": "在...上",
    "after": "之后",
    "before": "之前",
    "during": "期间",
}

GROUP_LABELS: dict[str, str] = {
    "person": "人物概念",
    "content": "知识内容",
    "concept": "概念术语",
    "organization": "组织实体",
    "artifact": "实体对象",
    "method": "方法机制",
    "event": "事件要素",
    "data": "数据要素",
    "creature": "生物对象",
    "location": "地点实体",
    "unknown": "图谱概念",
}

KEYWORD_STOPWORDS = {
    "法律",
    "法律的",
    "相关",
    "主要",
    "包括",
    "有关",
    "当事人",
    "本条",
    "规定",
    "内容",
    "实体",
    "概念",
    "关系",
    "义务",
    "权利",
    "责任",
    "情况",
    "行为",
    "方面",
    "事项",
    "主体",
    "可以",
    "用于",
    "进行",
    "中的",
}

KEYWORD_STOP_SUBSTRINGS = {
    "当事人",
    "法律的",
    "民事的",
    "主要的",
    "基础的",
    "各种",
    "各样",
    "之内",
    "之上",
    "之下",
    "相关知",
    "表示相",
}


@dataclass
class ParsedNode:
    id: str
    label: str
    description: str
    group: str
    source_color: str
    base_size: float


@dataclass
class ParsedEdge:
    source: str
    target: str
    weight: float
    description: str


@dataclass
class BuildConfig:
    source_html: Path | None
    source_graphml: Path | None
    output_json: Path
    output_stats: Path
    output_manifest: Path
    translation_cache: Path
    target_node_count: int
    min_center_trees: int
    online_translate: bool


def truncate_text(text: str, limit: int) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 1]}…"


def contains_ascii_letter(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]", text))


def chinese_char_count(text: str) -> int:
    return len(re.findall(r"[\u4e00-\u9fff]", text))


def chinese_ratio(text: str) -> float:
    if not text:
        return 0.0
    return chinese_char_count(text) / max(1, len(text))


def normalize_separators(text: str) -> str:
    normalized = text.replace("<SEP>", "；")
    normalized = normalized.replace("\r", " ").replace("\n", " ")
    normalized = normalized.replace("\t", " ")
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = normalized.replace(" ,", "，").replace(" .", "。")
    normalized = normalized.replace(" ;", "；").replace(" :", "：")
    normalized = re.sub(r"[;；]{2,}", "；", normalized)
    return normalized.strip(" ,;；。")


def merge_chinese_spacing(text: str) -> str:
    merged = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    merged = re.sub(r"\s+([，。；：、）)])", r"\1", merged)
    merged = re.sub(r"([（(])\s+", r"\1", merged)
    merged = re.sub(r"([，。；：、])\s+", r"\1", merged)
    return merged.strip()


def deenglishify_text(text: str) -> str:
    transformed = normalize_separators(text)

    for phrase, translated in sorted(PHRASE_TRANSLATIONS.items(), key=lambda item: len(item[0]), reverse=True):
        transformed = re.sub(re.escape(phrase), translated, transformed, flags=re.IGNORECASE)

    for token, translated in TOKEN_TRANSLATIONS.items():
        transformed = re.sub(rf"\b{re.escape(token)}\b", translated, transformed, flags=re.IGNORECASE)

    transformed = re.sub(r"[A-Za-z][A-Za-z0-9_\-./'’]*", "", transformed)
    transformed = re.sub(r"\s+", " ", transformed)
    transformed = re.sub(r"[，,]{2,}", "，", transformed)
    transformed = re.sub(r"[。\.]{2,}", "。", transformed)
    transformed = re.sub(r"[；;]{2,}", "；", transformed)
    transformed = transformed.strip(" ,;；。")
    transformed = merge_chinese_spacing(transformed)
    return transformed


def normalize_tooltip_text(text: str) -> str:
    normalized = normalize_separators(text)
    normalized = normalized.replace("?", "？").replace("!", "！")
    normalized = normalized.replace(",", "，").replace(":", "：")
    normalized = normalized.replace(";", "；")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def extract_clean_clauses(text: str) -> list[str]:
    base = normalize_tooltip_text(text)
    if not base:
        return []

    raw_parts = re.split(r"[。；！？]", base)
    clauses: list[str] = []
    seen: set[str] = set()
    for part in raw_parts:
        cleaned = deenglishify_text(part)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ，；。")
        cleaned = merge_chinese_spacing(cleaned)
        cleaned = re.sub(r"[，]{2,}", "，", cleaned)
        if len(cleaned) < 4:
            continue
        if cleaned in seen:
            continue
        seen.add(cleaned)
        clauses.append(cleaned)
    return clauses


def extract_keywords(text: str, *, max_count: int = 4) -> list[str]:
    normalized = normalize_tooltip_text(text)
    normalized = deenglishify_text(normalized)
    normalized = re.sub(r"[^\u4e00-\u9fff]+", " ", normalized)
    candidates = re.findall(r"[\u4e00-\u9fff]{2,8}", normalized)

    if not candidates:
        return []

    freq: dict[str, int] = {}
    first_pos: dict[str, int] = {}

    def is_valid_keyword(token: str) -> bool:
        if len(token) < 3 or len(token) > 6:
            return False
        if token in KEYWORD_STOPWORDS:
            return False
        if any(ch in token for ch in {"的", "或", "在", "于", "被"}):
            return False
        if token[0] in {"的", "和", "或", "在", "与", "于", "及"}:
            return False
        if token[-1] in {"的", "和", "或", "在", "与", "于", "及"}:
            return False
        if any(ch in token for ch in {"（", "）", "-", "—"}):
            return False
        for frag in KEYWORD_STOP_SUBSTRINGS:
            if frag in token:
                return False
        return True

    for idx, item in enumerate(candidates):
        token = item.strip()
        if not is_valid_keyword(token):
            continue
        if token.endswith(("的", "了", "和")):
            token = token[:-1]
        if not is_valid_keyword(token):
            continue
        freq[token] = freq.get(token, 0) + 1
        if token not in first_pos:
            first_pos[token] = idx

    ordered = sorted(freq.keys(), key=lambda key: (-freq[key], first_pos[key], len(key)))
    return ordered[:max_count]


def pick_topic_keyword(candidates: list[str]) -> str:
    for token in candidates:
        if not re.fullmatch(r"[\u4e00-\u9fff]{3,5}", token):
            continue
        if any(ch in token for ch in {"和", "及", "之", "该"}):
            continue
        if token.count("人") >= 2:
            continue
        return token
    return ""


def translate_text_online(text: str, cache: dict[str, str]) -> str:
    if not text:
        return ""

    if text in cache:
        return cache[text]

    query = urllib.parse.quote(text)
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl=auto&tl=zh-CN&dt=t&q={query}"
    )

    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        chunks = payload[0] if isinstance(payload, list) and payload else []
        translated = "".join(part[0] for part in chunks if isinstance(part, list) and part and part[0])
        cache[text] = translated or text
    except Exception:
        cache[text] = text

    return cache[text]


def rewrite_label(
    text: str,
    *,
    online_translate: bool,
    cache: dict[str, str],
    fallback_text: str,
    limit: int,
) -> str:
    candidate = deenglishify_text(text)
    if not candidate and online_translate and contains_ascii_letter(text):
        candidate = deenglishify_text(translate_text_online(text, cache))
    if not candidate:
        candidate = deenglishify_text(fallback_text)
    if not candidate:
        candidate = fallback_text.strip() or "未命名实体"
    return truncate_text(candidate, limit)


def rewrite_node_tooltip(
    *,
    subject_label: str,
    group_key: str,
    raw_text: str,
    online_translate: bool,
    cache: dict[str, str],
    limit: int,
) -> str:
    candidate_text = raw_text.strip() or subject_label
    if online_translate and contains_ascii_letter(candidate_text) and chinese_ratio(candidate_text) < 0.12:
        candidate_text = translate_text_online(candidate_text, cache)

    subject = merge_chinese_spacing(deenglishify_text(subject_label)) or subject_label
    group_cn = GROUP_LABELS.get(group_key.lower(), GROUP_LABELS["unknown"])
    sentence = f"{subject}是{group_cn}，用于表达该主题在图谱中的语义关系"

    sentence = sentence.strip(" ，；。") + "。"
    return truncate_text(sentence, limit)


def rewrite_edge_tooltip(
    *,
    from_label: str,
    to_label: str,
    raw_text: str,
    online_translate: bool,
    cache: dict[str, str],
    limit: int,
) -> str:
    candidate_text = raw_text.strip() or ""
    if online_translate and contains_ascii_letter(candidate_text) and chinese_ratio(candidate_text) < 0.12:
        candidate_text = translate_text_online(candidate_text, cache)

    left = merge_chinese_spacing(deenglishify_text(from_label)) or from_label
    right = merge_chinese_spacing(deenglishify_text(to_label)) or to_label
    sentence = f"{left}与{right}在语义层面存在关联，可用于知识溯源分析"

    sentence = sentence.strip(" ，；。") + "。"
    return truncate_text(sentence, limit)


def normalize_hex_color(raw_color: str) -> str:
    stripped = raw_color.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", stripped):
        return stripped
    return ""


def pick_node_color(group_key: str, is_center: bool) -> str:
    if not group_key:
        return NODE_COLOR_PALETTE[0]
    idx = sum(ord(ch) for ch in group_key) % len(NODE_COLOR_PALETTE)
    return NODE_COLOR_PALETTE[idx]


def build_adjacency(edges: list[ParsedEdge]) -> dict[str, list[tuple[str, float]]]:
    adjacency: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source].append((edge.target, edge.weight))
        adjacency[edge.target].append((edge.source, edge.weight))
    return adjacency


def pick_center_roots(
    nodes_by_id: dict[str, ParsedNode],
    adjacency: dict[str, list[tuple[str, float]]],
    min_center_trees: int,
) -> list[str]:
    degree_sorted = sorted(
        nodes_by_id.keys(),
        key=lambda node_id: len(adjacency.get(node_id, [])),
        reverse=True,
    )
    roots = [node_id for node_id in degree_sorted if len(adjacency.get(node_id, [])) >= 2][:min_center_trees]
    if len(roots) < min_center_trees:
        for node_id in degree_sorted:
            if node_id in roots:
                continue
            roots.append(node_id)
            if len(roots) >= min_center_trees:
                break
    return roots


def expand_tree_nodes(
    root: str,
    adjacency: dict[str, list[tuple[str, float]]],
    degree_map: dict[str, int],
    budget: int,
) -> set[str]:
    selected = {root}
    queue = deque([(root, 0)])

    while queue and len(selected) < budget:
        current, depth = queue.popleft()
        if depth >= 2:
            continue

        neighbors = adjacency.get(current, [])
        ranked_neighbors = sorted(
            neighbors,
            key=lambda item: (item[1], degree_map.get(item[0], 0)),
            reverse=True,
        )

        for neighbor, _weight in ranked_neighbors:
            if neighbor in selected:
                continue
            selected.add(neighbor)
            queue.append((neighbor, depth + 1))
            if len(selected) >= budget:
                break

    return selected


def reduce_graph(
    nodes_by_id: dict[str, ParsedNode],
    edges: list[ParsedEdge],
    *,
    target_node_count: int,
    min_center_trees: int,
) -> tuple[set[str], list[ParsedEdge], list[str]]:
    adjacency = build_adjacency(edges)
    degree_map = {node_id: len(adjacency.get(node_id, [])) for node_id in nodes_by_id}

    safe_target = max(min_center_trees * 28, target_node_count)
    center_roots = pick_center_roots(nodes_by_id, adjacency, min_center_trees)
    tree_budget = max(28, safe_target // max(1, len(center_roots)))

    kept_nodes: set[str] = set()
    for root in center_roots:
        kept_nodes |= expand_tree_nodes(root, adjacency, degree_map, tree_budget)

    degree_sorted = sorted(nodes_by_id.keys(), key=lambda node_id: degree_map.get(node_id, 0), reverse=True)

    if len(kept_nodes) < safe_target:
        connected_candidates = [
            node_id
            for node_id in degree_sorted
            if node_id not in kept_nodes and any(nei in kept_nodes for nei, _ in adjacency.get(node_id, []))
        ]
        for node_id in connected_candidates:
            kept_nodes.add(node_id)
            if len(kept_nodes) >= safe_target:
                break

    if len(kept_nodes) < safe_target:
        for node_id in degree_sorted:
            if node_id in kept_nodes:
                continue
            kept_nodes.add(node_id)
            if len(kept_nodes) >= safe_target:
                break

    if len(kept_nodes) > safe_target:
        must_keep = set(center_roots)
        optional_nodes = [
            node_id
            for node_id in degree_sorted
            if node_id in kept_nodes and node_id not in must_keep
        ]
        trimmed = set(center_roots)
        for node_id in optional_nodes:
            trimmed.add(node_id)
            if len(trimmed) >= safe_target:
                break
        kept_nodes = trimmed

    kept_edges = [
        edge
        for edge in edges
        if edge.source in kept_nodes and edge.target in kept_nodes
    ]

    return kept_nodes, kept_edges, center_roots


def prune_edges_for_radial_layout(
    *,
    kept_nodes: set[str],
    kept_edges: list[ParsedEdge],
    center_roots: list[str],
) -> list[ParsedEdge]:
    if not kept_edges:
        return kept_edges

    center_set = set(center_roots)
    center_edges: list[ParsedEdge] = []
    non_center_edges: list[ParsedEdge] = []
    for edge in kept_edges:
        if edge.source in center_set or edge.target in center_set:
            center_edges.append(edge)
        else:
            non_center_edges.append(edge)

    if not non_center_edges:
        return center_edges

    connected: set[str] = set(center_set)
    for edge in center_edges:
        connected.add(edge.source)
        connected.add(edge.target)

    unconnected = {node_id for node_id in kept_nodes if node_id not in connected}
    if not unconnected:
        return center_edges

    pool = sorted(non_center_edges, key=lambda edge: edge.weight, reverse=True)
    selected_non_center: list[ParsedEdge] = []

    while unconnected and pool:
        picked_index = -1

        for idx, edge in enumerate(pool):
            edge_has_connected = edge.source in connected or edge.target in connected
            edge_has_unconnected = edge.source in unconnected or edge.target in unconnected
            if edge_has_connected and edge_has_unconnected:
                picked_index = idx
                break

        if picked_index < 0:
            for idx, edge in enumerate(pool):
                if edge.source in unconnected or edge.target in unconnected:
                    picked_index = idx
                    break

        if picked_index < 0:
            break

        edge = pool.pop(picked_index)
        selected_non_center.append(edge)
        connected.add(edge.source)
        connected.add(edge.target)
        unconnected.discard(edge.source)
        unconnected.discard(edge.target)

    return center_edges + selected_non_center


def parse_graphml(path: Path) -> tuple[dict[str, ParsedNode], list[ParsedEdge]]:
    root = ET.parse(path).getroot()

    key_name_map: dict[str, str] = {}
    for key_el in root.findall("g:key", GRAPHML_NS):
        key_id = key_el.attrib.get("id")
        attr_name = key_el.attrib.get("attr.name")
        if key_id and attr_name:
            key_name_map[key_id] = attr_name

    nodes: dict[str, ParsedNode] = {}
    for node_el in root.findall(".//g:node", GRAPHML_NS):
        node_id = node_el.attrib.get("id")
        if not node_id:
            continue

        attrs: dict[str, str] = {}
        for data_el in node_el.findall("g:data", GRAPHML_NS):
            key_id = data_el.attrib.get("key")
            if not key_id:
                continue
            attr_name = key_name_map.get(key_id, key_id)
            attrs[attr_name] = (data_el.text or "").strip()

        description = attrs.get("description") or attrs.get("entity_id") or node_id
        nodes[node_id] = ParsedNode(
            id=node_id,
            label=attrs.get("label") or node_id,
            description=description,
            group=attrs.get("entity_type", "unknown"),
            source_color="",
            base_size=10,
        )

    edges: list[ParsedEdge] = []
    for edge_el in root.findall(".//g:edge", GRAPHML_NS):
        source = edge_el.attrib.get("source")
        target = edge_el.attrib.get("target")
        if not source or not target:
            continue

        attrs: dict[str, str] = {}
        for data_el in edge_el.findall("g:data", GRAPHML_NS):
            key_id = data_el.attrib.get("key")
            if not key_id:
                continue
            attr_name = key_name_map.get(key_id, key_id)
            attrs[attr_name] = (data_el.text or "").strip()

        try:
            weight = float(attrs.get("weight", "1"))
        except ValueError:
            weight = 1.0

        edges.append(
            ParsedEdge(
                source=source,
                target=target,
                weight=weight,
                description=attrs.get("description", ""),
            )
        )

    return nodes, edges


def extract_dataset_blob(content: str, variable_name: str, trailing_anchor: str) -> str:
    pattern = rf"{variable_name}\s*=\s*new vis\.DataSet\((\[.*?\])\);\s*{trailing_anchor}"
    match = re.search(pattern, content, flags=re.DOTALL)
    if not match:
        raise ValueError(f"无法从 HTML 中提取 {variable_name} 数据集")
    return match.group(1)


def parse_pyvis_html(path: Path) -> tuple[dict[str, ParsedNode], list[ParsedEdge]]:
    content = path.read_text(encoding="utf-8")
    nodes_blob = extract_dataset_blob(content, "nodes", "edges\\s*=\\s*new vis\\.DataSet")
    edges_blob = extract_dataset_blob(content, "edges", "nodeColors")

    raw_nodes = json.loads(nodes_blob)
    raw_edges = json.loads(edges_blob)

    nodes: dict[str, ParsedNode] = {}
    for item in raw_nodes:
        node_id = str(item.get("id") or item.get("label") or "").strip()
        if not node_id:
            continue

        label = str(item.get("label") or node_id)
        description = str(item.get("description") or item.get("title") or label)
        group = str(item.get("entity_type") or item.get("group") or "unknown")
        source_color = normalize_hex_color(str(item.get("color") or ""))
        try:
            base_size = float(item.get("size") or 10)
        except (TypeError, ValueError):
            base_size = 10

        nodes[node_id] = ParsedNode(
            id=node_id,
            label=label,
            description=description,
            group=group,
            source_color=source_color,
            base_size=base_size,
        )

    edges: list[ParsedEdge] = []
    for item in raw_edges:
        source = str(item.get("from") or "").strip()
        target = str(item.get("to") or "").strip()
        if not source or not target:
            continue

        try:
            weight = float(item.get("width") or 1)
        except (TypeError, ValueError):
            weight = 1.0

        edges.append(
            ParsedEdge(
                source=source,
                target=target,
                weight=max(1.0, weight),
                description=str(item.get("description") or item.get("title") or ""),
            )
        )

    return nodes, edges


def to_public_url(path: Path) -> str:
    normalized = path.as_posix()
    marker = "/public/"
    idx = normalized.find(marker)
    if idx >= 0:
        return "/" + normalized[idx + len(marker) :]
    return "/" + normalized


def load_config(path: Path) -> BuildConfig:
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
    else:
        raw = {}

    source_html = raw.get("source_html")
    source_graphml = raw.get("source_graphml")

    return BuildConfig(
        source_html=Path(source_html) if source_html else DEFAULT_SOURCE_HTML,
        source_graphml=Path(source_graphml) if source_graphml else None,
        output_json=Path(raw.get("output_json") or DEFAULT_OUTPUT_JSON),
        output_stats=Path(raw.get("output_stats") or DEFAULT_OUTPUT_STATS),
        output_manifest=Path(raw.get("output_manifest") or DEFAULT_OUTPUT_MANIFEST),
        translation_cache=Path(raw.get("translation_cache") or DEFAULT_TRANSLATION_CACHE),
        target_node_count=int(raw.get("target_node_count") or DEFAULT_TARGET_NODE_COUNT),
        min_center_trees=int(raw.get("min_center_trees") or DEFAULT_MIN_CENTER_TREES),
        online_translate=bool(raw.get("online_translate", True)),
    )


def merge_cli_overrides(config: BuildConfig, args: argparse.Namespace) -> BuildConfig:
    source_html = args.source_html if args.source_html is not None else config.source_html
    source_graphml = args.source_graphml if args.source_graphml is not None else config.source_graphml

    online_translate = config.online_translate
    if args.online_translate is not None:
        online_translate = args.online_translate

    return BuildConfig(
        source_html=source_html,
        source_graphml=source_graphml,
        output_json=args.output_json or config.output_json,
        output_stats=args.output_stats or config.output_stats,
        output_manifest=args.output_manifest or config.output_manifest,
        translation_cache=args.translation_cache or config.translation_cache,
        target_node_count=args.target_node_count or config.target_node_count,
        min_center_trees=args.min_center_trees or config.min_center_trees,
        online_translate=online_translate,
    )


def load_translation_cache(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if isinstance(data, dict):
        return {str(k): str(v) for k, v in data.items()}
    return {}


def to_vis_payload(
    *,
    nodes_by_id: dict[str, ParsedNode],
    kept_nodes: set[str],
    kept_edges: list[ParsedEdge],
    center_roots: list[str],
    source_path: Path,
    source_kind: str,
    target_node_count: int,
    online_translate: bool,
    translation_cache: dict[str, str],
) -> dict[str, Any]:
    adjacency = build_adjacency(kept_edges)
    degree_map = {node_id: len(adjacency.get(node_id, [])) for node_id in kept_nodes}

    label_map: dict[str, str] = {}
    vis_nodes: list[dict[str, Any]] = []
    for node_id in kept_nodes:
        node = nodes_by_id[node_id]
        degree = degree_map.get(node_id, 0)
        is_center = node_id in center_roots

        localized_label = rewrite_label(
            node.label,
            limit=18,
            online_translate=online_translate,
            cache=translation_cache,
            fallback_text=node_id,
        )
        if not localized_label:
            localized_label = truncate_text(node_id, 18)
        label_map[node_id] = localized_label

        localized_desc = rewrite_node_tooltip(
            subject_label=localized_label,
            group_key=node.group,
            raw_text=node.description,
            online_translate=online_translate,
            cache=translation_cache,
            limit=96,
        )

        size = 11 + min(14, degree)
        if is_center:
            size += 9

        vis_nodes.append(
            {
                "id": node_id,
                "label": localized_label,
                "title": f"{localized_label}：{localized_desc}",
                "group": node.group,
                "color": {
                    "background": pick_node_color(node.group, is_center),
                    "border": pick_node_color(node.group, is_center),
                    "highlight": {
                        "background": pick_node_color(node.group, is_center),
                        "border": pick_node_color(node.group, is_center),
                    },
                    "hover": {
                        "background": pick_node_color(node.group, is_center),
                        "border": pick_node_color(node.group, is_center),
                    },
                },
                "shape": "dot",
                "size": size,
                "borderWidth": 2.4 if is_center else 1.2,
            }
        )

    vis_edges: list[dict[str, Any]] = []
    for edge in kept_edges:
        from_label = label_map.get(edge.source, edge.source)
        to_label = label_map.get(edge.target, edge.target)

        edge_desc = rewrite_edge_tooltip(
            from_label=from_label,
            to_label=to_label,
            raw_text=edge.description,
            online_translate=online_translate,
            cache=translation_cache,
            limit=96,
        )

        width = 1.0 + min(3.5, max(0.0, edge.weight))
        vis_edges.append(
            {
                "from": edge.source,
                "to": edge.target,
                "width": round(width, 2),
                "title": f"{from_label} → {to_label}：{edge_desc}",
                "smooth": True,
                "color": "rgba(0,71,255,0.32)",
            }
        )

    payload: dict[str, Any] = {
        "meta": {
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "sourceKind": source_kind,
            "sourcePath": str(source_path),
            "sourceNodeCount": len(nodes_by_id),
            "sourceEdgeCount": len(kept_edges),
            "keptNodeCount": len(vis_nodes),
            "keptEdgeCount": len(vis_edges),
            "targetNodeCount": target_node_count,
            "sourceGraphBytes": source_path.stat().st_size,
            "centerRoots": [label_map.get(root, root) for root in center_roots],
            "translationMode": "google-gtx" if online_translate else "rule-based",
        },
        "nodes": sorted(vis_nodes, key=lambda item: item["size"], reverse=True),
        "edges": sorted(vis_edges, key=lambda item: item["width"], reverse=True),
    }

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build reduced TraceWindow knowledge graph data from GraphML or pyvis HTML.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--source-html", type=Path, default=None)
    parser.add_argument("--source-graphml", type=Path, default=None)
    parser.add_argument("--output-json", type=Path, default=None)
    parser.add_argument("--output-stats", type=Path, default=None)
    parser.add_argument("--output-manifest", type=Path, default=None)
    parser.add_argument("--translation-cache", type=Path, default=None)
    parser.add_argument("--target-node-count", type=int, default=None)
    parser.add_argument("--min-center-trees", type=int, default=None)
    parser.add_argument("--online-translate", action=argparse.BooleanOptionalAction, default=None)
    args = parser.parse_args()

    config = load_config(args.config)
    config = merge_cli_overrides(config, args)

    source_path: Path | None = None
    source_kind = ""
    if config.source_html and config.source_html.exists():
        source_path = config.source_html
        source_kind = "pyvis_html"
        nodes_by_id, edges = parse_pyvis_html(config.source_html)
    elif config.source_graphml and config.source_graphml.exists():
        source_path = config.source_graphml
        source_kind = "graphml"
        nodes_by_id, edges = parse_graphml(config.source_graphml)
    else:
        raise FileNotFoundError("未找到可用图谱源文件：请在配置中设置 source_html 或 source_graphml")

    kept_nodes, kept_edges, center_roots = reduce_graph(
        nodes_by_id,
        edges,
        target_node_count=config.target_node_count,
        min_center_trees=config.min_center_trees,
    )
    kept_edges = prune_edges_for_radial_layout(
        kept_nodes=kept_nodes,
        kept_edges=kept_edges,
        center_roots=center_roots,
    )

    translation_cache = load_translation_cache(config.translation_cache)
    payload = to_vis_payload(
        nodes_by_id=nodes_by_id,
        kept_nodes=kept_nodes,
        kept_edges=kept_edges,
        center_roots=center_roots,
        source_path=source_path,
        source_kind=source_kind,
        target_node_count=config.target_node_count,
        online_translate=config.online_translate,
        translation_cache=translation_cache,
    )
    payload["meta"]["sourceEdgeCount"] = len(edges)

    config.output_json.parent.mkdir(parents=True, exist_ok=True)
    config.output_stats.parent.mkdir(parents=True, exist_ok=True)
    config.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    config.translation_cache.parent.mkdir(parents=True, exist_ok=True)

    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    config.output_json.write_text(serialized, encoding="utf-8")

    output_size = config.output_json.stat().st_size
    stats = {
        "source": {
            "kind": source_kind,
            "path": str(source_path),
            "nodeCount": len(nodes_by_id),
            "edgeCount": len(edges),
            "graphBytes": source_path.stat().st_size,
        },
        "output": {
            "nodeCount": len(payload["nodes"]),
            "edgeCount": len(payload["edges"]),
            "graphBytes": output_size,
            "nodeRatio": round(len(payload["nodes"]) / max(1, len(nodes_by_id)), 4),
            "sizeRatio": round(output_size / max(1, source_path.stat().st_size), 4),
        },
        "constraints": {
            "targetNodeCount": config.target_node_count,
            "minCenterTrees": config.min_center_trees,
            "actualCenterTrees": len(center_roots),
            "centerRoots": payload["meta"]["centerRoots"],
            "translationMode": "google-gtx" if config.online_translate else "rule-based",
        },
    }
    config.output_stats.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {
        "activeDataUrl": to_public_url(config.output_json),
        "statsUrl": to_public_url(config.output_stats),
        "generatedAt": payload["meta"]["generatedAt"],
        "sourceKind": source_kind,
        "sourcePath": str(source_path),
        "targetNodeCount": config.target_node_count,
        "centerRoots": payload["meta"]["centerRoots"],
        "translationMode": "google-gtx" if config.online_translate else "rule-based",
    }
    config.output_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    config.translation_cache.write_text(json.dumps(translation_cache, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
