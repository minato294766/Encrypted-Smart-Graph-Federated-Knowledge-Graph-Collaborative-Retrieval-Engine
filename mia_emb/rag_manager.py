"""
MiA-RAG Manager: per-user knowledge graph isolation with global center-node access.

Each user gets their own LightRAG working_dir, sharing the same embedding model.
Center node queries can aggregate across all users.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from .mia_config import MiAConfig
from .mia_embedding import MiAEmbedding
from .mia_rag import MiARAG
from .mindscape_summarizer import MindscapeSummarizer

logger = logging.getLogger("mia_rag_manager")


class MiARAGManager:
    """Manages per-user MiARAG instances with shared embedding model."""

    def __init__(self, config: MiAConfig, base_dir: str = "./mia_rag_storage"):
        self.config = config
        self.base_dir = base_dir
        self._user_rags: dict[int, MiARAG] = {}
        self._embedding: Optional[MiAEmbedding] = None
        self._summarizer: Optional[MindscapeSummarizer] = None
        self._initialized = False
        self._node_permissions: dict[int, list[str]] = {}  # user_id -> list of allowed query levels

    async def initialize(self, lang: str = "zh"):
        """Load shared embedding model and summarizer once."""
        logger.info("Initializing MiA-RAG Manager (shared models)...")
        self._embedding = MiAEmbedding(self.config)
        self._embedding.load(
            model_path=self.config.model_path,
            base_model_path=self.config.base_model_path,
        )
        logger.info("Shared MiA-EMB model loaded")

        if self.config.deepseek_api_key:
            self._summarizer = MindscapeSummarizer(self.config)
            logger.info("Shared summarizer ready")

        self._initialized = True
        logger.info(f"Manager ready. Base dir: {self.base_dir}")

    async def get_user_rag(self, user_id: int) -> MiARAG:
        """Get or create an isolated RAG instance for a user."""
        if user_id in self._user_rags:
            return self._user_rags[user_id]

        user_dir = str(Path(self.base_dir) / f"user_{user_id}")
        logger.info(f"Creating RAG instance for user {user_id} at {user_dir}")

        rag = MiARAG(self.config, working_dir=user_dir)
        # Share the pre-loaded embedding model and summarizer
        rag.mia_embedding = self._embedding
        rag.summarizer = self._summarizer

        await rag._setup_lightrag("zh")
        rag._load_mindscape()

        self._user_rags[user_id] = rag
        logger.info(f"User {user_id} RAG instance ready")
        return rag

    async def get_all_user_rags(self) -> list[tuple[int, MiARAG]]:
        """Return all active user RAG instances (for center node queries)."""
        return list(self._user_rags.items())

    def set_node_permissions(self, user_id: int, allowed_levels: list[str]):
        """Set query permission levels for a user's RAG node."""
        self._node_permissions[user_id] = allowed_levels

    def _filter_users_by_permission(self, query_level: str = "default") -> list[tuple[int, MiARAG]]:
        """Filter user RAGs by query permission level."""
        if query_level == "default" or not self._node_permissions:
            return list(self._user_rags.items())

        allowed = []
        for user_id, rag in self._user_rags.items():
            perms = self._node_permissions.get(user_id, ["default"])
            if query_level in perms or "default" in perms:
                allowed.append((user_id, rag))
        return allowed

    async def _judge_aggregate(self, question: str, candidates: list[dict]) -> str:
        """Use LLM as judge model to aggregate multi-node answers.

        Implements the weighted aggregation from the design doc (3.3.3):
        Judge model restructures key facts from all candidate answers,
        weighted by confidence scores.
        """
        if not candidates:
            return "无节点返回有效结果"
        if len(candidates) == 1:
            return candidates[0].get("answer", "")

        # Build structured candidate list for judge model
        candidate_texts = []
        for i, c in enumerate(candidates):
            conf = c.get("confidence", 0.5)
            answer = c.get("answer", "")
            source = c.get("source_user_id", f"节点{i+1}")
            candidate_texts.append(f"节点{source}(置信度:{conf:.2f}):\n{answer}")

        prompt = f"""你是一个联邦知识图谱协同检索的法官模型。以下是来自不同节点的候选答案及其置信度。
请基于这些候选答案进行归纳整合，遵循以下规则：
1. 仅基于提供的候选答案进行归纳，不引入外部知识
2. 保留各节点答案中的关键事实，消除矛盾
3. 高置信度答案中的事实优先保留
4. 如果多个节点提供相同事实，该事实可信度更高
5. 输出一段连贯的综合答案

原始问题: {question}

候选答案:
{chr(10).join(candidate_texts)}

请输出综合答案:"""

        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=self.config.deepseek_api_key,
                base_url=self.config.deepseek_base_url,
            )
            response = await client.chat.completions.create(
                model=self.config.deepseek_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1024,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"Judge model failed, falling back to best-answer: {e}")
            # Fallback: return highest confidence answer
            candidates.sort(key=lambda x: x.get("confidence", 0), reverse=True)
            return candidates[0].get("answer", "")

    async def query_global(self, question: str, mode: str = "mix",
                           query_level: str = "default", **kwargs) -> dict:
        """Query across users' knowledge graphs (center node mode).

        With permission filtering and judge model aggregation.
        """
        # Filter by permission level
        target_rags = self._filter_users_by_permission(query_level)

        all_results = []
        for user_id, rag in target_rags:
            try:
                result = await rag.query(question, mode=mode, **kwargs)
                result["source_user_id"] = user_id
                all_results.append(result)
            except Exception as e:
                logger.warning(f"Query failed for user {user_id}: {e}")

        if not all_results:
            return {
                "answer": "",
                "context": {},
                "metadata": {"mode": "global", "user_count": 0},
            }

        # Sort by confidence
        all_results.sort(
            key=lambda r: r.get("metadata", {}).get("confidence", 0),
            reverse=True,
        )

        # Judge model aggregation when multiple results exist
        aggregated_answer = await self._judge_aggregate(question, all_results)

        # Build metadata
        best = all_results[0]
        confidences = [r.get("metadata", {}).get("confidence", 0) for r in all_results]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        # Collect all evidence from all results
        all_evidence = []
        all_fine_chunks = []
        all_coarse_communities = []
        for r in all_results:
            ctx = r.get("context", {})
            if isinstance(ctx, dict):
                all_fine_chunks.extend(ctx.get("fine_chunks", []))
                all_coarse_communities.extend(ctx.get("coarse_communities", []))

        return {
            "answer": aggregated_answer,
            "context": {
                "fine_chunks": all_fine_chunks[:10],
                "coarse_communities": all_coarse_communities[:5],
                "chunks": best.get("context", {}).get("chunks", [])[:5],
            },
            "evidence": [
                {"source": c.get("id", "unknown"), "content": c.get("content", "")[:500], "relevance": c.get("score", 0.0)}
                for c in all_fine_chunks[:5] if isinstance(c, dict) and c.get("content")
            ] + [
                {"source": f"社区{c.get('id', '?')}: {c.get('summary', '')}", "content": "、".join(c.get("top_entities", [])[:5]), "relevance": 0.7}
                for c in all_coarse_communities[:3] if isinstance(c, dict)
            ],
            "parsed_query": best.get("metadata", {}).get("parsed_query", {}),
            "metadata": {
                "mode": "global",
                "user_count": len(all_results),
                "all_user_ids": [r["source_user_id"] for r in all_results],
                "confidence": avg_confidence,
                "max_confidence": confidences[0] if confidences else 0,
                "aggregation": "judge_model" if len(all_results) > 1 else "single_node",
                "mindscape_used": any(
                    r.get("metadata", {}).get("mindscape_used", False) for r in all_results
                ),
            },
        }

    async def close(self):
        """Close all user RAG instances."""
        for uid, rag in self._user_rags.items():
            try:
                await rag.close()
            except Exception as e:
                logger.warning(f"Error closing RAG for user {uid}: {e}")
        self._user_rags.clear()
